package dev.mensori.seabattle;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import ru.rustore.sdk.pay.RuStorePayClient;
import ru.rustore.sdk.pay.model.SdkTheme;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(RuStoreBridgePlugin.class);
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) {
            proceedRuStoreIntent(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Возврат из банка после оплаты: RuStore Pay SDK восстанавливает шторку.
        proceedRuStoreIntent(intent);
    }

    private void proceedRuStoreIntent(Intent intent) {
        if (intent == null) return;
        try {
            RuStorePayClient.Companion.getInstance()
                    .getIntentInteractor()
                    .proceedIntent(intent, SdkTheme.DARK);
        } catch (Throwable error) {
            // Нет RuStore на устройстве или SDK не инициализировался — не наша беда.
            Log.d(TAG, "RuStore Pay intent skipped: " + error.getMessage());
        }
    }
}
