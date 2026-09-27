package com.vinkulo.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.room.Database;
import androidx.room.Dao;
import androidx.room.Entity;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.PrimaryKey;
import androidx.room.Query;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(entities = {OfflineDatabase.ContextRow.class, OfflineDatabase.RecordRow.class}, version = 2, exportSchema = true)
abstract class OfflineDatabase extends RoomDatabase {
    @Entity(tableName = "offline_context")
    public static class ContextRow {
        @PrimaryKey public int id = 1;
        @NonNull public byte[] sealed = new byte[0];
    }
    @Entity(tableName = "local_records", primaryKeys = {"scope", "recordId"})
    public static class RecordRow {
        @NonNull public String scope = "";
        @NonNull public String recordId = "";
        @NonNull public byte[] sealed = new byte[0];
    }
    @Dao
    public interface Storage {
        @Query("SELECT * FROM offline_context WHERE id = 1") ContextRow context();
        @Insert(onConflict = OnConflictStrategy.REPLACE) void save(ContextRow row);
        @Query("DELETE FROM offline_context") void lock();
        @Insert(onConflict = OnConflictStrategy.REPLACE) void put(RecordRow row);
        @Query("SELECT * FROM local_records WHERE scope = :scope AND recordId = :recordId") RecordRow get(String scope, String recordId);
        @Query("SELECT * FROM local_records WHERE scope = :scope ORDER BY recordId LIMIT 201") java.util.List<RecordRow> list(String scope);
        @Query("SELECT COUNT(*) FROM local_records") int recordCount();
        @Query("DELETE FROM local_records WHERE scope = :scope AND recordId = :recordId") void remove(String scope, String recordId);
    }
    abstract Storage storage();

    static final Migration MIGRATION_1_2 = new Migration(1, 2) {
        @Override public void migrate(@NonNull SupportSQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS local_records (scope TEXT NOT NULL, recordId TEXT NOT NULL, sealed BLOB NOT NULL, PRIMARY KEY(scope, recordId))");
        }
    };

    static OfflineDatabase open(Context context, String name) {
        return Room.databaseBuilder(context.getApplicationContext(), OfflineDatabase.class, name)
                .addMigrations(MIGRATION_1_2).build();
    }
}
