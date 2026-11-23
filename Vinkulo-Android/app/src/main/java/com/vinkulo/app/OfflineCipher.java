package com.vinkulo.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class OfflineCipher {
    private static final Object KEY_LOCK = new Object();
    private final String alias;
    private SecretKey cachedKey;
    OfflineCipher(String alias) { this.alias = alias; }
    private SecretKey key() throws Exception {
        synchronized (KEY_LOCK) {
        if (cachedKey != null) return cachedKey;
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias)) { cachedKey = (SecretKey) store.getKey(alias, null); return cachedKey; }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        cachedKey = generator.generateKey(); return cachedKey;
        }
    }
    byte[] seal(byte[] plaintext, String scope) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(scope.getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(plaintext), iv = cipher.getIV();
        if (iv.length != 12) throw new IllegalStateException("Invalid IV");
        byte[] sealed = new byte[13 + ciphertext.length]; sealed[0] = 1;
        System.arraycopy(iv, 0, sealed, 1, 12); System.arraycopy(ciphertext, 0, sealed, 13, ciphertext.length);
        return sealed;
    }
    byte[] open(byte[] sealed, String scope) throws Exception {
        if (sealed.length < 29 || sealed[0] != 1) throw new IllegalArgumentException("Invalid envelope");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOfRange(sealed, 1, 13)));
        cipher.updateAAD(scope.getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(sealed, 13, sealed.length - 13);
    }
}
