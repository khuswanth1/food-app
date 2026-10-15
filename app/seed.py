"""Deterministic demo data. All names, addresses and people are fictional.

Run manually with ``python -m app.seed`` (startup also seeds when SEED_ON_STARTUP=true and the DB is empty).
"""
import random
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Address, Coupon, Favorite, Notification, Order, OrderItem, OrderStatus as S, OrderStatusEvent, Payment,
    PaymentStatus, Product, Review, Role, Store, StoreType, SupportTicket, User,
)
from app.product_photos import stock_photo

DEMO_PASSWORD = "Password@123"
CENTER = (12.9716, 77.5946)  # Bengaluru

RESTAURANTS = [
    ("Spice Route Kitchen", "North Indian,Mughlai,Biryani", 2, False, {
        "Starters": [("Paneer Tikka", 249, True), ("Chicken Seekh Kebab", 299, False), ("Hara Bhara Kebab", 199, True)],
        "Main Course": [("Butter Chicken", 349, False), ("Dal Makhani", 259, True), ("Kadai Paneer", 289, True)],
        "Biryani": [("Hyderabadi Chicken Biryani", 329, False), ("Veg Dum Biryani", 249, True)],
        "Breads": [("Butter Naan", 59, True), ("Garlic Naan", 69, True), ("Tandoori Roti", 39, True)],
        "Desserts": [("Gulab Jamun", 99, True), ("Rasmalai", 129, True)],
        "Beverages": [("Sweet Lassi", 89, True), ("Masala Chaas", 59, True)],
    }),
    ("Dosa Darbar", "South Indian,Breakfast", 1, True, {
        "Breakfast": [("Masala Dosa", 99, True), ("Idli Vada Combo", 79, True), ("Rava Dosa", 109, True),
                      ("Ghee Podi Idli", 89, True)],
        "Meals": [("South Indian Thali", 179, True), ("Curd Rice", 99, True)],
        "Beverages": [("Filter Coffee", 39, True), ("Badam Milk", 69, True)],
        "Desserts": [("Kesari Bath", 59, True)],
    }),
    ("Napoli Wood Fired", "Pizza,Italian", 3, False, {
        "Pizza": [("Margherita", 299, True), ("Pepperoni", 399, False), ("Farmhouse", 349, True),
                  ("BBQ Chicken", 419, False)],
        "Pasta": [("Arrabbiata Penne", 279, True), ("Alfredo Chicken", 329, False)],
        "Sides": [("Garlic Bread", 149, True), ("Cheesy Fries", 169, True)],
        "Desserts": [("Tiramisu", 219, True), ("Choco Lava Cake", 129, True)],
        "Beverages": [("Iced Tea", 99, True), ("Cola", 60, True)],
    }),
    ("Burger Barn", "Burgers,American,Fast Food", 2, False, {
        "Burgers": [("Classic Chicken Burger", 189, False), ("Crispy Veg Burger", 149, True),
                    ("Double Cheese Smash", 259, False), ("Paneer Royale", 199, True)],
        "Sides": [("Peri Peri Fries", 119, True), ("Onion Rings", 109, True), ("Chicken Wings", 219, False)],
        "Beverages": [("Chocolate Shake", 159, True), ("Cold Coffee", 139, True)],
        "Desserts": [("Brownie Sundae", 149, True)],
    }),
    ("Wok & Roll", "Chinese,Asian", 2, False, {
        "Starters": [("Chilli Paneer", 229, True), ("Dragon Chicken", 259, False), ("Veg Spring Rolls", 169, True)],
        "Main Course": [("Hakka Noodles", 189, True), ("Schezwan Fried Rice", 199, True),
                        ("Chicken Manchurian Gravy", 249, False)],
        "Beverages": [("Lemon Iced Tea", 89, True)],
        "Desserts": [("Date Pancake", 149, True)],
    }),
    ("Green Bowl Co.", "Healthy,Salads,Cafe", 3, True, {
        "Salads": [("Quinoa Power Bowl", 289, True), ("Greek Salad", 249, True), ("Paneer Protein Bowl", 299, True)],
        "Wraps": [("Falafel Wrap", 219, True), ("Hummus Veggie Wrap", 199, True)],
        "Beverages": [("Cold Pressed Juice", 149, True), ("Green Smoothie", 169, True)],
    }),
    ("Kolkata Rolls Express", "Rolls,Street Food,Snacks", 1, False, {
        "Rolls": [("Egg Chicken Roll", 139, False), ("Paneer Kathi Roll", 129, True), ("Mutton Roll", 179, False)],
        "Snacks": [("Pani Puri", 59, True), ("Aloo Tikki Chaat", 79, True)],
        "Beverages": [("Masala Soda", 49, True)],
    }),
    ("Sweet Tooth Patisserie", "Desserts,Bakery,Ice Cream", 2, True, {
        "Desserts": [("Red Velvet Pastry", 129, True), ("Belgian Waffle", 179, True), ("Blueberry Cheesecake", 219, True)],
        "Ice Cream": [("Death by Chocolate", 199, True), ("Mango Sorbet", 129, True)],
        "Bakery": [("Butter Croissant", 99, True), ("Chocolate Chip Cookies (4)", 149, True)],
        "Beverages": [("Hot Chocolate", 149, True)],
    }),
    ("Biryani Blues House", "Biryani,Kebabs,Mughlai", 2, False, {
        "Biryani": [("Lucknowi Mutton Biryani", 399, False), ("Chicken 65 Biryani", 299, False),
                    ("Paneer Biryani", 259, True)],
        "Kebabs": [("Galouti Kebab", 329, False), ("Tandoori Mushroom", 239, True)],
        "Sides": [("Mirchi Ka Salan", 79, True), ("Raita", 49, True)],
        "Desserts": [("Double Ka Meetha", 119, True)],
    }),
    ("Cafe Brewster", "Cafe,Coffee,Snacks", 2, True, {
        "Coffee": [("Cappuccino", 159, True), ("Cold Brew", 189, True), ("Hazelnut Latte", 199, True)],
        "Snacks": [("Grilled Cheese Sandwich", 179, True), ("Pesto Panini", 219, True)],
        "Bakery": [("Banana Bread", 109, True), ("Blueberry Muffin", 119, True)],
    }),
]

GROCERY = [
    ("FreshMart Daily", {
        "Fruits": [("Bananas", 49, "1 dozen"), ("Apples Shimla", 189, "1 kg"), ("Pomegranate", 159, "500 g")],
        "Vegetables": [("Tomatoes", 39, "1 kg"), ("Onions", 45, "1 kg"), ("Potatoes", 35, "1 kg"),
                       ("Spinach", 25, "250 g")],
        "Dairy": [("Toned Milk", 28, "500 ml"), ("Paneer", 95, "200 g"), ("Curd", 45, "400 g"), ("Butter", 56, "100 g")],
        "Bakery": [("Whole Wheat Bread", 45, "400 g"), ("Pav Buns", 35, "6 pcs")],
        "Staples": [("Basmati Rice", 149, "1 kg"), ("Toor Dal", 165, "1 kg"), ("Atta", 289, "5 kg")],
    }),
    ("Green Basket Organics", {
        "Fruits": [("Organic Avocado", 199, "2 pcs"), ("Kiwi", 129, "3 pcs")],
        "Vegetables": [("Organic Broccoli", 89, "500 g"), ("Bell Peppers Mix", 119, "3 pcs")],
        "Staples": [("Quinoa", 299, "500 g"), ("Rolled Oats", 189, "1 kg")],
        "Spreads": [("Peanut Butter", 249, "350 g"), ("Raw Honey", 299, "500 g")],
        "Dairy": [("Greek Yogurt", 85, "200 g"), ("A2 Cow Milk", 75, "1 L")],
    }),
    ("QuickStop Essentials", {
        "Snacks": [("Potato Chips", 20, "52 g"), ("Masala Peanuts", 55, "200 g"), ("Dark Chocolate", 99, "100 g")],
        "Beverages": [("Orange Juice", 125, "1 L"), ("Green Tea", 165, "25 bags"), ("Instant Coffee", 245, "100 g")],
        "Household": [("Dishwash Liquid", 105, "500 ml"), ("Detergent Powder", 199, "1 kg")],
        "Personal Care": [("Toothpaste", 95, "150 g"), ("Hand Wash", 99, "200 ml")],
        "Breakfast": [("Corn Flakes", 185, "475 g"), ("Muesli", 349, "500 g")],
    }),
    ("Daily Dairy & More", {
        "Dairy": [("Full Cream Milk", 34, "500 ml"), ("Cheese Slices", 140, "200 g"), ("Ghee", 299, "500 ml"),
                  ("Fresh Cream", 65, "200 ml")],
        "Bakery": [("Multigrain Bread", 55, "400 g"), ("Brown Eggs", 99, "6 pcs")],
        "Spices": [("Garam Masala", 85, "100 g"), ("Turmeric Powder", 45, "100 g")],
    }),
]

PEOPLE = {
    Role.ADMIN: [("Asha Admin", "admin@quickkart.dev")],
    Role.VENDOR: [("Vikram Rao", "vendor@quickkart.dev"), ("Meera Iyer", "meera.vendor@quickkart.dev"),
                  ("Rahul Kapoor", "rahul.vendor@quickkart.dev"), ("Fatima Sheikh", "fatima.vendor@quickkart.dev")],
    Role.DELIVERY: [("Arjun Singh", "rider@quickkart.dev"), ("Kiran Das", "kiran.rider@quickkart.dev"),
                    ("Sneha Patil", "sneha.rider@quickkart.dev")],
    Role.CUSTOMER: [("Priya Sharma", "customer@quickkart.dev"), ("Aman Verma", "aman@quickkart.dev"),
                    ("Neha Gupta", "neha@quickkart.dev"), ("Rohan Mehta", "rohan@quickkart.dev"),
                    ("Isha Nair", "isha@quickkart.dev"), ("Dev Malhotra", "dev@quickkart.dev"),
                    ("Tara Joseph", "tara@quickkart.dev"), ("Kabir Khan", "kabir@quickkart.dev")],
}

REVIEW_TEXT = {
    5: ["Absolutely loved it!", "Hot, fresh and on time.", "Best in the area, will order again."],
    4: ["Tasty food, slightly late.", "Good portions and packaging.", "Really good, minor spill."],
    3: ["Average, okay for the price.", "Decent but could be better."],
    2: ["Food was cold on arrival.", "Not as good as last time."],
    1: ["Wrong item delivered."],
}


def _jitter(rng: random.Random, spread: float = 0.06) -> tuple[float, float]:
    return CENTER[0] + rng.uniform(-spread, spread), CENTER[1] + rng.uniform(-spread, spread)


def seed(db: Session, *, orders: int = 220, rng_seed: int = 42) -> bool:
    if db.scalar(select(User.id).limit(1)):
        return False
    rng = random.Random(rng_seed)
    pw = hash_password(DEMO_PASSWORD)
    users: dict[Role, list[User]] = {}
    for role, people in PEOPLE.items():
        users[role] = []
        for name, email in people:
            u = User(email=email, full_name=name, password_hash=pw, role=role,
                     phone=f"+91 9{rng.randint(100000000, 999999999)}")
            if role == Role.DELIVERY:
                u.is_online = True
                u.current_lat, u.current_lng = _jitter(rng, 0.03)
            db.add(u)
            users[role].append(u)
    db.flush()

    for c in users[Role.CUSTOMER]:
        lat, lng = _jitter(rng)
        db.add(Address(user_id=c.id, label="Home", line1=f"{rng.randint(1, 400)}, {rng.choice(['MG Road', 'Indiranagar 100ft Rd', 'Koramangala 5th Block', 'HSR Layout Sector 2', 'Jayanagar 4th Block'])}",
                       city="Bengaluru", pincode=f"5600{rng.randint(10, 99)}", lat=lat, lng=lng, is_default=True))
        lat, lng = _jitter(rng)
        db.add(Address(user_id=c.id, label="Work", line1=f"Tower {rng.choice('ABCD')}, Tech Park, Outer Ring Road",
                       city="Bengaluru", pincode="560103", lat=lat, lng=lng))

    vendors = users[Role.VENDOR]
    stores: list[Store] = []
    for i, (name, cuisines, price_level, veg, menu) in enumerate(RESTAURANTS):
        lat, lng = _jitter(rng, 0.05)
        s = Store(vendor_id=vendors[i % len(vendors)].id, name=name, store_type=StoreType.RESTAURANT,
                  description=f"{cuisines.split(',')[0]} favourites, freshly prepared.", cuisines=cuisines,
                  address=f"{rng.randint(1, 200)}, {rng.choice(['Church Street', 'Brigade Road', 'Residency Road', '80ft Road'])}, Bengaluru",
                  lat=lat, lng=lng, prep_time_min=rng.choice([15, 20, 25, 30]),
                  delivery_fee=rng.choice([0, 25, 30, 40]), min_order=rng.choice([0, 99, 149]),
                  price_level=price_level, is_veg_only=veg)
        db.add(s)
        db.flush()
        for cat, items in menu.items():
            for pname, price, is_veg in items:
                db.add(Product(store_id=s.id, name=pname, category=cat, price=price, is_veg=is_veg,
                               description=f"House special {pname.lower()}.",
                               tags=",".join(t for t in [cat.lower(), "bestseller" if rng.random() < 0.25 else ""] if t),
                               stock=rng.randint(15, 120), low_stock_threshold=10, image_url=stock_photo(pname)))
        stores.append(s)

    for i, (name, menu) in enumerate(GROCERY):
        lat, lng = _jitter(rng, 0.05)
        s = Store(vendor_id=vendors[(i + 1) % len(vendors)].id, name=name, store_type=StoreType.GROCERY,
                  description="Groceries & daily essentials delivered in minutes.",
                  cuisines="Groceries," + ",".join(menu.keys()),
                  address=f"{rng.randint(1, 200)}, {rng.choice(['BTM Layout', 'Whitefield Main Rd', 'Malleshwaram 8th Cross'])}, Bengaluru",
                  lat=lat, lng=lng, prep_time_min=8, delivery_fee=rng.choice([0, 15, 20]), min_order=99, price_level=2)
        db.add(s)
        db.flush()
        for cat, items in menu.items():
            for pname, price, unit in items:
                db.add(Product(store_id=s.id, name=pname, category=cat, price=price,
                               mrp=round(price * rng.uniform(1.05, 1.25)), unit=unit, is_veg=True,
                               tags=cat.lower(), stock=rng.randint(3, 200), low_stock_threshold=12,
                               max_qty=10,  # quick-commerce style "max 10 per order"
                               image_url=stock_photo(pname)))
        stores.append(s)
    # A pending store so the admin approval flow has something to act on
    db.add(Store(vendor_id=vendors[0].id, name="Tandoor Nights (pending)", store_type=StoreType.RESTAURANT,
                 cuisines="North Indian,Kebabs", address="12, Lavelle Road, Bengaluru", lat=12.968, lng=77.598,
                 is_approved=False, description="Awaiting approval"))
    db.flush()

    db.add_all([
        Coupon(code="WELCOME50", description="50% off up to ₹100 on your order", discount_type="percent",
               value=50, max_discount=100, min_order=149),
        Coupon(code="FLAT75", description="Flat ₹75 off on orders above ₹399", discount_type="flat",
               value=75, min_order=399),
        Coupon(code="FRESH20", description="20% off groceries at FreshMart", discount_type="percent",
               value=20, max_discount=150, min_order=299, store_id=stores[len(RESTAURANTS)].id),
        Coupon(code="EXPIRED10", description="Expired demo coupon", discount_type="percent", value=10,
               valid_until=datetime.now(UTC) - timedelta(days=3)),
    ])

    # Historical orders give analytics and recommendations something to learn from.
    products_by_store = {s.id: list(db.scalars(select(Product).where(Product.store_id == s.id))) for s in stores}
    customers, partners = users[Role.CUSTOMER], users[Role.DELIVERY]
    # Each customer has taste preferences -> realistic co-purchase patterns
    prefs = {c.id: rng.sample(stores, 4) for c in customers}
    now = datetime.now(UTC)
    review_count = 0
    for n in range(orders):
        c = rng.choice(customers)
        s = rng.choice(prefs[c.id]) if rng.random() < 0.8 else rng.choice(stores)
        addr = db.scalar(select(Address).where(Address.user_id == c.id, Address.is_default.is_(True)))
        created = now - timedelta(days=rng.uniform(0, 29), hours=rng.uniform(0, 12))
        prods = products_by_store[s.id]
        anchor = rng.choice(prods)
        basket = {anchor.id: anchor}
        same_cat = [p for p in prods if p.category != anchor.category]
        for p in rng.sample(same_cat, min(len(same_cat), rng.randint(1, 3))):
            basket[p.id] = p
        lines = [(p, rng.randint(1, 3)) for p in basket.values()]
        subtotal = round(sum(p.price * q for p, q in lines), 2)
        tax = round(subtotal * 0.05, 2)
        status = S.DELIVERED if rng.random() < 0.9 else S.CANCELLED
        method = rng.choice(["card", "upi", "upi", "wallet", "cod"])
        o = Order(order_number=f"QK{created:%y%m%d}{secrets.token_hex(3).upper()}", customer_id=c.id,
                  store_id=s.id, partner_id=rng.choice(partners).id if status == S.DELIVERED else None,
                  status=status, delivery_address=f"{addr.label}: {addr.line1}, {addr.city}",
                  delivery_lat=addr.lat, delivery_lng=addr.lng, subtotal=subtotal, delivery_fee=s.delivery_fee,
                  tax=tax, total=round(subtotal + s.delivery_fee + tax, 2), payment_method=method,
                  payment_status=PaymentStatus.PAID if status == S.DELIVERED else PaymentStatus.REFUNDED,
                  eta_minutes=0, created_at=created,
                  delivered_at=created + timedelta(minutes=rng.randint(22, 50)) if status == S.DELIVERED else None,
                  cancel_reason=None if status == S.DELIVERED else "Changed my mind")
        db.add(o)
        db.flush()
        for p, q in lines:
            db.add(OrderItem(order_id=o.id, product_id=p.id, name=p.name, price=p.price, quantity=q))
        db.add(OrderStatusEvent(order_id=o.id, status=S.PLACED, note="Order placed", created_at=created))
        db.add(OrderStatusEvent(order_id=o.id, status=status, created_at=o.delivered_at or created + timedelta(minutes=3)))
        db.add(Payment(order_id=o.id, amount=o.total, method=method, status=PaymentStatus.PAID,
                       transaction_ref=f"TXN{secrets.token_hex(8).upper()}", created_at=created,
                       message="Seeded payment"))
        if status == S.DELIVERED and rng.random() < 0.45:
            rating = rng.choices([5, 4, 3, 2, 1], weights=[45, 32, 13, 7, 3])[0]
            db.add(Review(user_id=c.id, store_id=s.id, order_id=o.id, rating=rating,
                          comment=rng.choice(REVIEW_TEXT[rating]), created_at=o.delivered_at))
            s.rating = round((s.rating * s.rating_count + rating) / (s.rating_count + 1), 2)
            s.rating_count += 1
            review_count += 1

    # Leave a few products low on stock to demo alerts
    for p in rng.sample([p for ps in products_by_store.values() for p in ps], 6):
        p.stock = rng.randint(2, 8)

    priya = customers[0]
    db.add_all([
        Favorite(user_id=priya.id, store_id=stores[0].id),
        Favorite(user_id=priya.id, store_id=stores[2].id),
        Notification(user_id=priya.id, title="Weekend treat 🎉", body="Use WELCOME50 for 50% off today",
                     kind="promo"),
        SupportTicket(user_id=priya.id, subject="Missing cutlery", message="Please include cutlery next time.",
                      status="resolved", admin_reply="Thanks for the feedback — noted with the restaurant!"),
        SupportTicket(user_id=customers[1].id, subject="Refund status",
                      message="When will my cancelled order be refunded?"),
    ])
    db.commit()
    return True


if __name__ == "__main__":
    from app.bootstrap import bootstrap

    bootstrap()
