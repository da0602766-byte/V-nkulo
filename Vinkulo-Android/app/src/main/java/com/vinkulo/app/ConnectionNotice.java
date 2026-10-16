package com.vinkulo.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Native fallback also works when WebView or the network cannot render a page. */
final class ConnectionNotice extends FrameLayout {
    ConnectionNotice(Context context, boolean disconnected, Runnable retry) {
        super(context);
        setBackgroundColor(Color.rgb(245, 249, 248));
        int gap = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL); content.setGravity(Gravity.CENTER);
        content.setPadding(gap, gap, gap, gap);
        FrameLayout.LayoutParams position = new FrameLayout.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels, gap * 24), -2, Gravity.CENTER);
        addView(content, position);
        View signal = new Signal(context);
        signal.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        content.addView(signal, new LinearLayout.LayoutParams(gap * 4, gap * 4));
        TextView title = new TextView(context);
        title.setText(disconnected ? "Você está sem internet" : "Modo offline desativado");
        title.setTextSize(22); title.setTextColor(Color.rgb(25, 63, 57)); title.setGravity(Gravity.CENTER);
        title.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        title.setPadding(0, gap, 0, gap / 2); content.addView(title);
        TextView detail = new TextView(context);
        detail.setText(disconnected ? "Confira o Wi-Fi ou os dados móveis. O Vínkulo volta automaticamente quando a conexão retornar."
                : "O proprietário desativou este recurso para todos. Seus rascunhos salvos continuam no aparelho.");
        detail.setTextSize(16); detail.setTextColor(Color.rgb(70, 93, 88)); detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, 0, 0, gap); content.addView(detail);
        Button button = new Button(context);
        button.setText(disconnected ? "Tentar novamente" : "Voltar ao sistema");
        button.setAllCaps(false); button.setTextSize(16); button.setMinHeight((int)(48 * getResources().getDisplayMetrics().density));
        button.setOnClickListener(v -> retry.run()); content.addView(button);
    }

    private static final class Signal extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private ValueAnimator animator;
        private float pulse = 1;
        Signal(Context context) { super(context); }
        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            boolean animate = Build.VERSION.SDK_INT >= 26 ? ValueAnimator.areAnimatorsEnabled()
                    : android.provider.Settings.Global.getFloat(getContext().getContentResolver(), android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1) > 0;
            if (!animate) return;
            animator = ValueAnimator.ofFloat(.35f, 1f); animator.setDuration(1100);
            animator.setRepeatCount(ValueAnimator.INFINITE); animator.setRepeatMode(ValueAnimator.REVERSE);
            animator.addUpdateListener(value -> { pulse = (float) value.getAnimatedValue(); invalidate(); }); animator.start();
        }
        @Override protected void onDetachedFromWindow() { if (animator != null) animator.cancel(); super.onDetachedFromWindow(); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth(), center = w / 2, y = getHeight() * .8f;
            paint.setColor(Color.rgb(20, 119, 107)); paint.setAlpha((int)(255 * pulse));
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(w * .055f); paint.setStrokeCap(Paint.Cap.ROUND);
            for (float radius : new float[]{w * .26f, w * .48f}) canvas.drawArc(center-radius,y-radius,center+radius,y+radius,225,90,false,paint);
            paint.setStyle(Paint.Style.FILL); canvas.drawCircle(center,y,w*.055f,paint);
            paint.setAlpha(255); paint.setStrokeWidth(w*.05f); canvas.drawLine(w*.23f,w*.16f,w*.77f,w*.8f,paint);
        }
    }
}
