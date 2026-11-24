# 📒 হিসাব খাতা (শুধু Netlify)

Render বা MongoDB লাগে না। ডাটা Netlify-র নিজস্ব Blobs স্টোরেজে থাকে।

## Netlify-তে দেওয়ার নিয়ম
1. এই ফোল্ডারের সব ফাইল GitHub-এ আপলোড করুন
2. Netlify → Add new site → Import from Git → ওই রিপো বেছে নিন (Build command ফাঁকা, বাকি ঠিক আছে)
3. Site configuration → Environment variables-এ দিন:
   - `APP_PASSWORD` = আপনার পাসওয়ার্ড
   - `SHOP_NAME` = ঔষধ ঘর
4. Deploy করুন (Environment variable দেওয়ার পর একবার Redeploy)

গুরুত্বপূর্ণ: "drag and drop" দিয়ে দিলে Functions চলবে না, Git (GitHub) দিয়েই দিতে হবে।
