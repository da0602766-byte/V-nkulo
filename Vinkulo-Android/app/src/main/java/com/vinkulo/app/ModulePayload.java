package com.vinkulo.app;
import org.json.JSONObject;

final class ModulePayload {
    static void validate(String module,JSONObject p,boolean complete) throws Exception {
        String[][] fields={
            {"tipo:30","titulo:120","descricao:2000","visibilidade:20"},
            {"titulo:100","texto:1200","cor:10"},
            {"visitanteId:0","tipo:20","resultado:160","descricao:1500","proximoContato:10"},
            {"itemId:0","version:0","status:20","observacao:600"},
            {"celulaId:0","data:10","observacoes:1000"},
            {"tipo:20","gravidade:10","descricao:1200"}};
        int index=java.util.Arrays.asList(ModuleAccess.MODULES).indexOf(module);if(index<0)throw new IllegalArgumentException("Módulo inválido.");
        if(p.length()!=fields[index].length)throw new IllegalArgumentException("Campos inválidos.");
        for(String field:fields[index]){String[] bits=field.split(":");String k=bits[0];int max=Integer.parseInt(bits[1]);Object value=p.get(k);
            if(max==0){if(!(value instanceof Number)||((Number)value).doubleValue()!=p.getLong(k)||p.getLong(k)<(k.equals("version")||!complete?0:1))throw new IllegalArgumentException("Selecione um registro válido.");}
            else if(!(value instanceof String)||((String)value).length()>max||((String)value).matches("(?s).*[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f].*"))throw new IllegalArgumentException("Campo inválido ou longo demais.");
        }
        if(!complete)return;
        if(module.equals("requests")){choice(p,"tipo","ORACAO,VISITA,ACONSELHAMENTO,APOIO,MINISTERIO,OUTRO,INFORMACAO");choice(p,"visibilidade","PASTORAL,GESTORES,PRIVADA");length(p,"titulo",3);length(p,"descricao",10);}
        if(module.equals("notes")){choice(p,"cor","amarelo,rosa,azul,verde");if(p.getString("titulo").trim().isEmpty())length(p,"texto",1);}
        if(module.equals("followups")){choice(p,"tipo","WHATSAPP,TELEFONE,PRESENCIAL,EMAIL,OUTRO");length(p,"resultado",1);date(p.optString("proximoContato"),true);}
        if(module.equals("checklists"))choice(p,"status","PENDENTE,FEITO,NAO_FEITO");
        if(module.equals("cells"))date(p.getString("data"),false);
        if(module.equals("parking")){choice(p,"tipo","SEGURANCA,DANO,BLOQUEIO,ORIENTACAO,OUTRO");choice(p,"gravidade","BAIXA,MEDIA,ALTA");length(p,"descricao",8);}
    }
    private static void length(JSONObject p,String k,int n)throws Exception{if(p.getString(k).trim().length()<n)throw new IllegalArgumentException("Preencha "+k+" com pelo menos "+n+" caracteres.");}
    private static void choice(JSONObject p,String k,String values)throws Exception{if(!java.util.Arrays.asList(values.split(",")).contains(p.getString(k)))throw new IllegalArgumentException("Opção inválida.");}
    private static void date(String date,boolean optional)throws Exception{if(optional&&date.isEmpty())return;java.text.SimpleDateFormat f=new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT);f.setLenient(false);if(!date.matches("\\d{4}-\\d{2}-\\d{2}")||!date.equals(f.format(f.parse(date))))throw new IllegalArgumentException("Data inválida.");}
}
