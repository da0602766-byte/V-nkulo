package com.vinkulo.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

final class OfflineSnapshot {
    static final int MAX_BYTES = 1024 * 1024;
    private static final String[] SECTIONS = {"mural", "eventos", "compromissos", "escalas"};
    static void validate(JSONObject snapshot) throws Exception {
        validate(snapshot,false);
    }
    static void validate(JSONObject snapshot, boolean extended) throws Exception {
        if(extended) keys(snapshot, "from", "until", "mural", "eventos", "compromissos", "escalas", "pedidos");
        else keys(snapshot, "from", "until", "mural", "eventos", "compromissos", "escalas");
        if (snapshot.getString("from").length() > 40 || snapshot.getString("until").length() > 40) invalid();
        for (String name : extended ? new String[]{"mural","eventos","compromissos","escalas","pedidos"} : SECTIONS) {
            JSONObject section = snapshot.getJSONObject(name);
            keys(section, "allowed", "hasMore", "items");
            boolean allowed = section.getBoolean("allowed");
            section.getBoolean("hasMore");
            JSONArray rows = section.getJSONArray("items");
            if ((!allowed && rows.length() != 0) || rows.length() > (name.equals("mural") || name.equals("pedidos") ? 50 : 100)) invalid();
            Set<Long> ids = new HashSet<>();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                if (name.equals("mural")) keys(row, "id", "titulo", "texto", "data", "autor");
                else if (name.equals("eventos")) keys(row, "id", "titulo", "texto", "data", "fim", "local");
                else if (name.equals("compromissos")) keys(row, "id", "titulo", "texto", "data", "fim", "local", "diaInteiro", "concluido");
                else if(name.equals("pedidos")) {
                    keys(row,"id","titulo","texto","tipo","status","data","atualizado");
                    if(row.getString("titulo").length()>240||row.getString("texto").length()>4000
                        ||!Arrays.asList("ORACAO","VISITA","ACONSELHAMENTO","APOIO","MINISTERIO","OUTRO","INFORMACAO").contains(row.getString("tipo"))
                        ||!Arrays.asList("ABERTA","EM_ANALISE","CONCLUIDA").contains(row.getString("status")))invalid();
                } else keys(row, "id", "escalaId", "titulo", "texto", "data", "fim", "local", "ministerio", "resposta");
                long id = row.getLong("id");
                if (id <= 0 || !ids.add(id)) invalid();
                if (row.getString("titulo").length() > 400 || row.getString("data").length() > 60
                        || row.optString("texto", "").length() > 12000) invalid();
                Iterator<String> fields = row.keys();
                while (fields.hasNext()) {
                    String field = fields.next(); Object value = row.get(field);
                    if (value instanceof JSONObject || value instanceof JSONArray) invalid();
                    if (!field.equals("texto") && String.valueOf(value).length() > 600) invalid();
                }
            }
        }
    }
    private static void keys(JSONObject object, String... allowed) {
        Set<String> expected = new HashSet<>(Arrays.asList(allowed));
        if (object.length() != expected.size()) invalid();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) if (!expected.contains(keys.next())) invalid();
    }
    private static void invalid() { throw new IllegalArgumentException("Invalid snapshot"); }
    private OfflineSnapshot() { }
}
