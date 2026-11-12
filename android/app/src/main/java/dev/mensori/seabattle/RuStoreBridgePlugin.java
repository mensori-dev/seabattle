package dev.mensori.seabattle;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yandex.mobile.ads.common.AdError;
import com.yandex.mobile.ads.common.AdRequest;
import com.yandex.mobile.ads.common.AdRequestError;
import com.yandex.mobile.ads.common.ImpressionData;
import com.yandex.mobile.ads.common.YandexAds;
import com.yandex.mobile.ads.interstitial.InterstitialAd;
import com.yandex.mobile.ads.interstitial.InterstitialAdEventListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoadListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoader;
import com.yandex.mobile.ads.rewarded.Reward;
import com.yandex.mobile.ads.rewarded.RewardedAd;
import com.yandex.mobile.ads.rewarded.RewardedAdEventListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoadListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoader;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import ru.rustore.sdk.pay.RuStorePayClient;
import ru.rustore.sdk.pay.model.AcknowledgementState;
import ru.rustore.sdk.pay.model.PreferredPurchaseType;
import ru.rustore.sdk.pay.model.Product;
import ru.rustore.sdk.pay.model.ProductId;
import ru.rustore.sdk.pay.model.ProductPurchase;
import ru.rustore.sdk.pay.model.ProductPurchaseParams;
import ru.rustore.sdk.pay.model.ProductPurchaseResult;
import ru.rustore.sdk.pay.model.Purchase;
import ru.rustore.sdk.pay.model.SdkTheme;

/**
 * Мост между js/rustore.js и RuStore Pay SDK.
 *
 * Плагин ничего не хранит на сервере и не знает про игрока: он только
 * показывает платёжную шторку RuStore, отдаёт список покупок с ценами
 * и крутит рекламу Yandex Mobile Ads.
 *
 * Если SDK не инициализировался (нет RuStore на устройстве, неверный
 * console_app_id_value, песочница), методы отвечают отказом — игра
 * продолжает работать как обычно.
 */
@CapacitorPlugin(name = "RuStoreBridge")
public class RuStoreBridgePlugin extends Plugin {
    private static final String TAG = "RuStoreBridge";
    private static final String REMOVE_ADS = "remove_ads";

    static final List<String> PRODUCT_IDS = Arrays.asList(REMOVE_ADS, "support_99");

    private boolean yandexReady = false;

    @Override
    public void load() {
        super.load();
        try {
            // Согласие на обработку данных для рекламы: политика описывает
            // Yandex Mobile Ads и AppMetrica, отдельных трекеров в игре нет.
            YandexAds.setUserConsent(true);
            YandexAds.setLocationTracking(false);
            YandexAds.initialize(getContext(), () -> {
                yandexReady = true;
                Log.d(TAG, "Yandex Mobile Ads готов");
            });
        } catch (Throwable error) {
            Log.w(TAG, "Yandex Mobile Ads недоступен", error);
        }
    }

    /** Реклама работает только когда рекламные места заданы в strings.xml. */
    private String adUnitId(int resId) {
        try {
            String value = getContext().getString(resId);
            return value == null ? "" : value.trim();
        } catch (Throwable error) {
            return "";
        }
    }

    private boolean adsSupported() {
        return !adUnitId(R.string.YANDEX_REWARDED_AD_UNIT_ID).isEmpty()
                && !adUnitId(R.string.YANDEX_INTERSTITIAL_AD_UNIT_ID).isEmpty();
    }

    private void resolveAd(final PluginCall call, final boolean shown, final boolean rewarded) {
        JSObject res = new JSObject();
        res.put("shown", shown);
        res.put("rewarded", rewarded);
        resolveOnUi(call, res);
    }


    private RuStorePayClient client() {
        return RuStorePayClient.Companion.getInstance();
    }

    private void resolveOnUi(final PluginCall call, final JSObject data) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            try {
                call.resolve(data);
            } catch (Exception ignored) {
                // Плагин уже отцепился — ответ никому не нужен.
            }
        });
    }

    private JSObject emptyItems() {
        return itemsResult(new JSArray());
    }

    private JSObject itemsResult(JSArray items) {
        JSObject res = new JSObject();
        res.put("items", items);
        // Рекламные места заполнены — app.js может показать витрину «Убрать рекламу».
        res.put("ads", adsSupported());
        return res;
    }

    private JSObject toJson(Product product) {
        JSObject item = new JSObject();
        String id = "";
        if (product.getProductId() != null) {
            id = String.valueOf(product.getProductId().getValue());
        }
        item.put("id", id);
        String title = id;
        if (product.getTitle() != null) {
            title = String.valueOf(product.getTitle().getValue());
        }
        item.put("title", title);
        // app.js показывает цену как «<price> ₽», поэтому отдаём рубли.
        double price = 0;
        if (product.getPrice() != null) {
            price = product.getPrice().getValue() / 100.0;
        }
        item.put("price", price);
        String currency = "RUB";
        if (product.getCurrency() != null) {
            currency = String.valueOf(product.getCurrency().getValue());
        }
        item.put("currency", currency);
        return item;
    }

    /** Список товаров с ценами из RuStore Консоли. */
    @PluginMethod
    public void products(final PluginCall call) {
        final List<ProductId> ids = new ArrayList<>();
        for (String id : PRODUCT_IDS) {
            ids.add(new ProductId(id));
        }
        try {
            client().getProductInteractor().getProducts(ids)
                    .addOnSuccessListener(products -> {
                        JSArray items = new JSArray();
                        if (products != null) {
                            for (Product product : products) {
                                items.put(toJson(product));
                            }
                        }
                        JSObject res = itemsResult(items);
                        resolveOnUi(call, res);
                    })
                    .addOnFailureListener(error -> {
                        Log.w(TAG, "getProducts failed", error);
                        resolveOnUi(call, emptyItems());
                    });
        } catch (Throwable error) {
            Log.w(TAG, "RuStore Pay SDK недоступен", error);
            resolveOnUi(call, emptyItems());
        }
    }

    /* ---------------- Реклама: Yandex Mobile Ads ---------------- */

    /**
     * Rewarded-видео. Ответ: { shown, rewarded }.
     * Показ — только по кнопке в интерфейсе, награду начисляет app.js.
     */
    @PluginMethod
    public void showRewarded(final PluginCall call) {
        final String unitId = adUnitId(R.string.YANDEX_REWARDED_AD_UNIT_ID);
        if (unitId.isEmpty() || getActivity() == null) {
            resolveAd(call, false, false);
            return;
        }
        final AtomicBoolean answered = new AtomicBoolean(false);
        final AtomicBoolean rewarded = new AtomicBoolean(false);
        try {
            RewardedAdLoader loader = new RewardedAdLoader(getContext());
            RewardedAdLoadListener listener = new RewardedAdLoadListener() {
                @Override
                public void onAdLoaded(final RewardedAd ad) {
                    ad.setAdEventListener(new RewardedAdEventListener() {
                        @Override
                        public void onAdShown() {
                        }

                        @Override
                        public void onAdFailedToShow(AdError error) {
                            Log.w(TAG, "rewarded show failed");
                            resolveOnce(call, answered, false, false);
                        }

                        @Override
                        public void onAdDismissed() {
                            resolveOnce(call, answered, true, rewarded.get());
                        }

                        @Override
                        public void onAdClicked() {
                        }

                        @Override
                        public void onAdImpression(ImpressionData data) {
                        }

                        @Override
                        public void onRewarded(Reward reward) {
                            rewarded.set(true);
                        }
                    });
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> ad.show(getActivity()));
                    } else {
                        resolveOnce(call, answered, false, false);
                    }
                }

                @Override
                public void onAdFailedToLoad(AdRequestError error) {
                    Log.w(TAG, "rewarded load failed: " + error.getDescription());
                    resolveOnce(call, answered, false, false);
                }
            };
            loader.loadAd(new AdRequest.Builder(unitId).build(), listener);
        } catch (Throwable error) {
            Log.w(TAG, "rewarded failed", error);
            resolveOnce(call, answered, false, false);
        }
    }

    /** Межстраничная реклама между боями. Ответ: { shown }. */
    @PluginMethod
    public void showInterstitial(final PluginCall call) {
        final String unitId = adUnitId(R.string.YANDEX_INTERSTITIAL_AD_UNIT_ID);
        if (unitId.isEmpty() || getActivity() == null) {
            resolveAd(call, false, false);
            return;
        }
        final AtomicBoolean answered = new AtomicBoolean(false);
        try {
            InterstitialAdLoader loader = new InterstitialAdLoader(getContext());
            InterstitialAdLoadListener listener = new InterstitialAdLoadListener() {
                @Override
                public void onAdLoaded(final InterstitialAd ad) {
                    ad.setAdEventListener(new InterstitialAdEventListener() {
                        @Override
                        public void onAdShown() {
                        }

                        @Override
                        public void onAdFailedToShow(AdError error) {
                            Log.w(TAG, "interstitial show failed");
                            resolveOnce(call, answered, false, false);
                        }

                        @Override
                        public void onAdDismissed() {
                            resolveOnce(call, answered, true, false);
                        }

                        @Override
                        public void onAdClicked() {
                        }

                        @Override
                        public void onAdImpression(ImpressionData data) {
                        }
                    });
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> ad.show(getActivity()));
                    } else {
                        resolveOnce(call, answered, false, false);
                    }
                }

                @Override
                public void onAdFailedToLoad(AdRequestError error) {
                    Log.w(TAG, "interstitial load failed: " + error.getDescription());
                    resolveOnce(call, answered, false, false);
                }
            };
            loader.loadAd(new AdRequest.Builder(unitId).build(), listener);
        } catch (Throwable error) {
            Log.w(TAG, "interstitial failed", error);
            resolveOnce(call, answered, false, false);
        }
    }

    private void resolveOnce(final PluginCall call, final AtomicBoolean answered,
                             final boolean shown, final boolean rewarded) {
        if (!answered.compareAndSet(false, true)) return;
        resolveAd(call, shown, rewarded);
    }

    /** Покупка товара. Ответ: { ok: true|false, message?: string }. */
    @PluginMethod
    public void purchase(final PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            resolvePurchase(call, new AtomicBoolean(false), false, "empty productId");
            return;
        }
        final AtomicBoolean answered = new AtomicBoolean(false);
        try {
            ProductPurchaseParams params = new ProductPurchaseParams(
                    new ProductId(productId), null, null, null, null, null);
            client().getPurchaseInteractor()
                    .purchase(params, PreferredPurchaseType.ONE_STEP, SdkTheme.DARK, null)
                    .addOnSuccessListener(result -> {
                        acknowledge(result);
                        resolvePurchase(call, answered, true, null);
                    })
                    .addOnFailureListener(error -> {
                        Log.w(TAG, "purchase failed", error);
                        resolvePurchase(call, answered, false, messageOf(error));
                    });
        } catch (Throwable error) {
            Log.w(TAG, "purchase failed", error);
            resolvePurchase(call, answered, false, messageOf(error));
        }
    }

    private void resolvePurchase(PluginCall call, AtomicBoolean answered,
                                 boolean ok, String message) {
        if (!answered.compareAndSet(false, true)) return;
        JSObject res = new JSObject();
        res.put("ok", ok);
        if (message != null) res.put("message", message);
        resolveOnUi(call, res);
    }

    /** Покупки пользователя. Ответ: { restored: true, если есть remove_ads }. */
    @PluginMethod
    public void restore(final PluginCall call) {
        final AtomicBoolean answered = new AtomicBoolean(false);
        try {
            client().getPurchaseInteractor().getPurchases(null, null, null)
                    .addOnSuccessListener(purchases -> {
                        boolean restored = false;
                        if (purchases != null) {
                            for (Purchase purchase : purchases) {
                                if (!(purchase instanceof ProductPurchase)) continue;
                                ProductPurchase productPurchase = (ProductPurchase) purchase;
                                String id = "";
                                if (productPurchase.getProductId() != null) {
                                    id = String.valueOf(productPurchase.getProductId().getValue());
                                }
                                if (REMOVE_ADS.equals(id)) {
                                    restored = true;
                                    acknowledgePurchase(productPurchase);
                                }
                            }
                        }
                        if (answered.compareAndSet(false, true)) {
                            JSObject res = new JSObject();
                            res.put("restored", restored);
                            resolveOnUi(call, res);
                        }
                    })
                    .addOnFailureListener(error -> {
                        Log.w(TAG, "getPurchases failed", error);
                        if (answered.compareAndSet(false, true)) {
                            JSObject res = new JSObject();
                            res.put("restored", false);
                            resolveOnUi(call, res);
                        }
                    });
        } catch (Throwable error) {
            Log.w(TAG, "restore failed", error);
            if (answered.compareAndSet(false, true)) {
                JSObject res = new JSObject();
                res.put("restored", false);
                resolveOnUi(call, res);
            }
        }
    }

    /** После успешной покупки просим RuStore подтвердить выдачу товара. */
    private void acknowledge(ProductPurchaseResult result) {
        if (result == null || result.getPurchaseId() == null) return;
        try {
            client().getPurchaseInteractor().getPurchase(result.getPurchaseId())
                    .addOnSuccessListener(this::acknowledgePurchase)
                    .addOnFailureListener(error -> Log.w(TAG, "acknowledge lookup failed", error));
        } catch (Throwable error) {
            Log.w(TAG, "acknowledge failed", error);
        }
    }

    private void acknowledgePurchase(Purchase purchase) {
        if (!(purchase instanceof ProductPurchase)) return;
        ProductPurchase productPurchase = (ProductPurchase) purchase;
        AcknowledgementState state = productPurchase.getAcknowledgementState();
        if (state == AcknowledgementState.ACKNOWLEDGED) return;
        try {
            client().getPurchaseInteractor().updateAcknowledgementState(
                    productPurchase.getPurchaseId(),
                    AcknowledgementState.ACKNOWLEDGED,
                    null);
        } catch (Throwable error) {
            Log.w(TAG, "updateAcknowledgementState failed", error);
        }
    }

    private String messageOf(Throwable error) {
        if (error == null) return "unknown";
        String message = error.getMessage();
        return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
