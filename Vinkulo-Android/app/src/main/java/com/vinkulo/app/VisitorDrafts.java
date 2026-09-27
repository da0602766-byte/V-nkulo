package com.vinkulo.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.UUID;

// One encrypted row is both draft and outbox record. A transition to PENDING
// cannot lose either the payload or its stable operation UUID. No schema reset.
final class VisitorDrafts {
    static final Object MUTEX = new Object();
    private final OfflineDatabase db;
    private final OfflineCipher cipher;
    VisitorDrafts(OfflineDatabase db, OfflineCipher cipher) { this.db=db; this.cipher=cipher; }
    private String aad(String scope,String id) { return "vinkulo:visitor:1:"+scope+":"+id; }
    JSONObject get(String scope,String id) throws Exception {
        OfflineDatabase.RecordRow row=db.storage().get(scope,id);
        return row==null?null:new JSONObject(new String(cipher.open(row.sealed,aad(scope,id)),StandardCharsets.UTF_8));
    }
    void put(String scope,String id,JSONObject value) throws Exception {
        putBounded(scope,id,value,8192);
    }
    void putBounded(String scope,String id,JSONObject value,int limit) throws Exception {
        byte[] bytes=value.toString().getBytes(StandardCharsets.UTF_8);
        if(bytes.length>limit) throw new IllegalArgumentException("Limite do registro excedido.");
        if(db.storage().get(scope,id)==null && db.storage().recordCount()>=201) throw new IllegalStateException("Limite local atingido. Remova rascunhos ou recibos já conferidos.");
        OfflineDatabase.RecordRow row=new OfflineDatabase.RecordRow();row.scope=scope;row.recordId=id;row.sealed=cipher.seal(bytes,aad(scope,id));db.storage().put(row);
    }
    static JSONObject payload(JSONObject input) throws Exception {
        String[] keys={"nomeCompleto","telefone","email","dataEntrada"};int[] limits={120,30,180,10};
        if(input.length()!=4)throw new IllegalArgumentException("Campos inválidos.");
        JSONObject clean=new JSONObject();
        for(int i=0;i<keys.length;i++){
            Object raw=input.get(keys[i]);if(!(raw instanceof String))throw new IllegalArgumentException("Campo inválido.");
            String value=((String)raw).trim();
            if(value.length()>limits[i] || value.matches("(?s).*[\\x00-\\x1f].*"))throw new IllegalArgumentException("Campo muito longo ou inválido.");
            clean.put(keys[i],value);
        }
        clean.put("email",clean.getString("email").toLowerCase(Locale.ROOT));
        return clean;
    }
    static void validate(JSONObject p) throws Exception {
        payload(p);
        if(p.getString("nomeCompleto").isEmpty())throw new IllegalArgumentException("Informe o nome completo.");
        String email=p.getString("email"), date=p.getString("dataEntrada");
        if(!email.isEmpty()&&!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))throw new IllegalArgumentException("Revise o e-mail.");
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);format.setLenient(false);
        if(!date.matches("\\d{4}-\\d{2}-\\d{2}") || !date.equals(format.format(format.parse(date))))throw new IllegalArgumentException("Revise a data de entrada.");
    }
    JSONObject save(String scope,String id,JSONObject payload) throws Exception {
        JSONObject data=payload(payload),row;
        if(id.isEmpty()) {id=UUID.randomUUID().toString();row=new JSONObject().put("id",id).put("state","DRAFT").put("attempts",0);}
        else {row=get(scope,id);if(row==null||!"DRAFT".equals(row.getString("state")))throw new IllegalStateException("Somente um rascunho pode ser editado.");}
        row.put("visitor",data).put("updatedAt",System.currentTimeMillis());put(scope,id,row);return row;
    }
    void enqueue(String scope,String id) throws Exception {
        JSONObject row=get(scope,id);if(row==null)throw new IllegalArgumentException("Rascunho não encontrado.");
        if(!"DRAFT".equals(row.getString("state")))return; // Double taps keep same UUID.
        validate(row.getJSONObject("visitor"));row.put("state","PENDING");put(scope,id,row);
    }
    void discard(String scope,String id) throws Exception {
        JSONObject row=get(scope,id);if(row==null)return;
        String state=row.getString("state");
        if(!state.equals("DRAFT")&&!state.equals("CONFIRMED")&&!state.equals("CONFLICT")&&!state.equals("REJECTED"))throw new IllegalStateException("Envio pendente: confira o resultado antes de remover.");
        db.storage().remove(scope,id);
    }
    JSONArray list(String scope) throws Exception {
        JSONArray rows=new JSONArray();for(OfflineDatabase.RecordRow row:db.storage().list(scope))rows.put(get(scope,row.recordId));return rows;
    }
    JSONObject claim(String scope,long now) throws Exception {
        for(OfflineDatabase.RecordRow stored:db.storage().list(scope)) {
            JSONObject row=get(scope,stored.recordId);String state=row.getString("state");
            if((state.equals("PENDING")||state.equals("RETRY")||(state.equals("SENDING")&&row.optLong("leaseUntil")<=now)) && row.optLong("nextAttemptAt")<=now) {
                row.put("state","SENDING").put("leaseId",UUID.randomUUID().toString()).put("leaseUntil",now+120000).put("attempts",row.optInt("attempts")+1);
                put(scope,stored.recordId,row);return row;
            }
        }return null;
    }
    boolean pending(String scope) throws Exception {
        JSONArray rows=list(scope);for(int i=0;i<rows.length();i++)if(java.util.Arrays.asList("PENDING","RETRY","SENDING").contains(rows.getJSONObject(i).getString("state")))return true;return false;
    }
    boolean finish(String scope,JSONObject row) throws Exception {
        JSONObject current=get(scope,row.getString("id"));
        if(current==null||!"SENDING".equals(current.optString("state"))||!current.optString("leaseId").equals(row.optString("leaseId")))return false;
        put(scope,row.getString("id"),row);return true;
    }
    void resume(String scope) throws Exception {
        // Reauthorization also recovers leases/retry deadlines after a reboot or
        // wall-clock change. A late worker may only finish its own lease.
        for(OfflineDatabase.RecordRow stored:db.storage().list(scope)) {
            JSONObject row=get(scope,stored.recordId);String state=row.getString("state");
            if(state.equals("SENDING")||state.equals("RETRY")) {
                row.put("state","PENDING").put("leaseId","").put("leaseUntil",0).put("nextAttemptAt",0);put(scope,stored.recordId,row);
            }
        }
    }
}
