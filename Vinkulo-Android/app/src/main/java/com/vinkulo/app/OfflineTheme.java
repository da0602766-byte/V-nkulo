package com.vinkulo.app;

import org.json.JSONObject;

/** Bounded colors only; no stylesheet, media URL or active content. */
final class OfflineTheme {
    static void validate(JSONObject theme) throws Exception {
        if (theme.length() != 4 || theme.getInt("version") != 1
                || !theme.getString("paletteId").matches("NEUTRO|CLASSICO|MODERNO|CORPORATIVO|ACOLHEDOR|SERENIDADE|CELEBRACAO|NOITE_CARMESIM|NOITE_OCEANO|NOITE_DOURADA")) {
            throw new IllegalArgumentException("Invalid theme");
        }
        String[] keys = {"bg","surface","surface-2","text","muted","line","primary","on-primary","link"};
        for (String mode : new String[]{"light", "dark"}) {
            JSONObject colors = theme.getJSONObject(mode);
            if (colors.length() != keys.length) throw new IllegalArgumentException("Invalid colors");
            for (String key : keys) if (!colors.getString(key).matches("#[0-9a-fA-F]{6}")) {
                throw new IllegalArgumentException("Invalid color");
            }
        }
    }
    private OfflineTheme() { }
}
