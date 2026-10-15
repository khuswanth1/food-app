from html import escape

from app.models import Order


def render_invoice(order: Order) -> str:
    rows = "".join(
        f"<tr><td>{escape(i.name)}</td><td class='r'>{i.quantity}</td>"
        f"<td class='r'>₹{i.price:.2f}</td><td class='r'>₹{i.price * i.quantity:.2f}</td></tr>"
        for i in order.items
    )
    discount = f"<tr><td colspan=3>Discount ({escape(order.coupon_code or '')})</td><td class='r'>−₹{order.discount:.2f}</td></tr>" if order.discount else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Invoice {order.order_number}</title>
<style>
body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:32px auto;color:#1f2937;padding:0 16px}}
h1{{color:#16a34a;margin:0}} table{{width:100%;border-collapse:collapse;margin-top:24px}}
td,th{{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}} .r{{text-align:right}}
.total td{{font-weight:700;font-size:1.1em;border-top:2px solid #111}} .muted{{color:#6b7280;font-size:.9em}}
.head{{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}}
@media print{{button{{display:none}}}}
</style></head><body>
<div class="head"><div><h1>QuickKart</h1><div class="muted">Tax invoice · demo data</div></div>
<div class="r"><strong>Invoice #{order.order_number}</strong><br><span class="muted">{order.created_at:%d %b %Y, %H:%M}</span></div></div>
<p><strong>Sold by:</strong> {escape(order.store.name)}<br><span class="muted">{escape(order.store.address)}</span></p>
<p><strong>Billed to:</strong> {escape(order.customer.full_name)}<br><span class="muted">{escape(order.delivery_address)}</span></p>
<table><thead><tr><th>Item</th><th class='r'>Qty</th><th class='r'>Price</th><th class='r'>Amount</th></tr></thead>
<tbody>{rows}
<tr><td colspan=3>Subtotal</td><td class='r'>₹{order.subtotal:.2f}</td></tr>{discount}
<tr><td colspan=3>Delivery fee</td><td class='r'>₹{order.delivery_fee:.2f}</td></tr>
<tr><td colspan=3>GST</td><td class='r'>₹{order.tax:.2f}</td></tr>
<tr class="total"><td colspan=3>Total</td><td class='r'>₹{order.total:.2f}</td></tr></tbody></table>
<p class="muted">Payment: {escape(order.payment_method.upper())} · {order.payment_status.value.title()}</p>
<button onclick="window.print()">Print / Save as PDF</button>
</body></html>"""
