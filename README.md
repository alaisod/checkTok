# Stock Checker - PWA & Cloud Sync System (Node.js)

ระบบตรวจนับสต๊อกสินค้า สแกนบาร์โค้ด รองรับการทำงาน **Offline 100%**, ติดตั้งเป็น **PWA (Progressive Web App)** บนหน้าจอมือถือได้ และสามารถ **Sync ข้อมูลเข้าสู่ระบบจัดเก็บ DB File (`./data/{job-id}/db.json`)** เมื่อมีสัญญาณอินเทอร์เน็ต

---

## 📁 โครงสร้างโปรเจกต์ (Clean Architecture)

โปรเจกต์ถูกแยกสัดส่วนระหว่าง **UI (Client)**, **Core Business Logic (Shared/Universal)**, **Backend (Server)** และ **Data Storage** อย่างชัดเจน:

```text
stock-checker3/
├── public/                       # 📱 UI Layer (Client-side หน้าจอการใช้งาน)
│   ├── css/                      # สไตล์ชีทและการแสดงผล
│   │   └── style.css
│   ├── icons/                    # ไอคอนแอป PWA (192px, 512px, favicon)
│   ├── js/                       # 🎨 UI Controllers & Event Handlers
│   │   ├── app.js                # จัดการ UI, DOM Events, Modals, Numpad, Gestures
│   │   └── sound.js              # เสียง Audio feedback ทาง UI
│   ├── index.html                # หน้าเว็บ PWA
│   ├── manifest.webmanifest      # คอนฟิกติดตั้งแอป PWA ลงหน้าจอมือถือ
│   └── sw.js                     # Service Worker สำหรับแคชออฟไลน์ 100%
│
├── src/
│   ├── core/                     # 🧠 Business Logic Layer (Universal Shared Modules)
│   │   ├── storage.js            # Logic การจัดการข้อมูลในเครื่อง, Session, Local Logs
│   │   ├── cloud.js              # Logic การซิงค์และเชื่อมประสาน Cloud Job
│   │   ├── merge.js              # Logic การคำนวณรวมยอดสินค้าซ้ำจากหลายอุปกรณ์
│   │   └── export.js             # Logic การจัดโครงสร้างรายงานและการแปลงข้อมูล CSV/PDF
│   ├── config/
│   │   └── index.js              # คอนฟิกระบบ (PORT, DATA_DIR, HOST)
│   ├── controllers/
│   │   └── jobController.js      # จัดการ Request/Response สำหรับ REST API
│   ├── routes/
│   │   └── apiRoutes.js          # RESTful Endpoints (/api/jobs, /api/status ฯลฯ)
│   ├── services/
│   │   └── storageService.js     # ควบคุมการเขียน/อ่านไฟล์ DB ใน ./data/{job-id}/
│   └── app.js                    # Express Application Setup & Static/Core Route Serving
│
├── data/                         # 💾 Storage เก็บ Database Files ของแต่ละรอบงาน
│   ├── jobs.json                 # ทะเบียนรอบงานทั้งหมด
│   └── {job-id}/
│       ├── db.json               # ฐานข้อมูล JSON หลักของรอบงานนั้น
│       ├── summary.csv           # ตารางสรุปยอดรวม (เปิดดูใน Excel ได้ทันที)
│       └── submissions/          # ประวัติยอดการส่งงานของพนักงานแต่ละคน
│
├── docs/                         # 📄 เอกสารและไฟล์รูปภาพอ้างอิง
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── README.md
└── server.js                     # Entry Point ของเซิร์ฟเวอร์
```

---

## 🌟 จุดเด่นของการแยก Core Logic กับ UI

1. **Clean Code & Separation of Concerns:**
   * `public/js/` รับผิดชอบเฉพาะส่วนการควบคุมหน้าจอ (UI, DOM, Event listeners, Animation, Sound)
   * `src/core/` รับผิดชอบตรรกะการคำนวณและการจัดการข้อมูลล้วนๆ (Business Logic, Math, Sync, Data Models)
2. **Universal / Isomorphic Modules:**
   * โมดูลใน `src/core/` (เช่น `merge.js`) สามารถถูกเรียกใช้งานได้ทั้งบน **Browser** (ผ่าน `<script src="core/...">`) และบน **Node.js Server** (ผ่าน `require('../core/...')`) ช่วยลดโค้ดที่ซ้ำซ้อนตามหลัก DRY (Don't Repeat Yourself)
3. **Offline-First & PWA Ready:**
   * ตัว `sw.js` ได้รับการตั้งค่าให้แคชทั้ง `/core/*.js` และ `/js/*.js` อัตโนมัติ สามารถติดตั้งลงหน้าจอมือถือและใช้งานแบบออฟไลน์ได้ 100%
4. **Late Sync & Closed Jobs Archive:**
   * **ส่งยอดตามหลังได้:** แม้งานจะถูกปิดรอบ (CLOSED) ไปแล้ว สมาชิกที่เพิ่งต่อเน็ตหรือนับค้างอยู่ก็ยังสามารถ Sync ยอดตามหลังเข้ามาได้ ระบบจะคำนวณรวมยอดใหม่ให้อัตโนมัติ
   * **คลังประวัติงานที่ปิดแล้ว:** มีเมนูย้อนดูงานที่ปิดแล้วทั้งหมด พร้อมตัวเลือก **"🔓 กลับมาเปิดใหม่ (Reopen)"** หรือ **"🗑️ ลบทิ้ง (Delete)"** ได้ทุกเมื่อ

---

## 🚀 วิธีการ Deploy ขึ้น Hostatom (cPanel / DirectAdmin)

บน **Hostatom** ที่มีเมนู **Setup Node.js App** ใน cPanel คุณสามารถตั้งค่าได้ง่ายๆ ดังนี้:

### 1. ตั้งค่า Create Application ใน cPanel:
* **Node.js version:** เลือกเวอร์ชัน **18.x** หรือ **20.x** ขึ้นไป
* **Application mode:** เลือก **Production**
* **Application root:** ระบุโฟลเดอร์โปรเจกต์ เช่น `stock-checker`
* **Application URL:** เลือกโดเมน หรือ Subdomain ที่ต้องการ (เช่น `stock.yourdomain.com`)
* **Application startup file:** ใส่ `server.js` (หรือ `app.js` ก็ได้ ระบบรองรับทั้งคู่)

### 2. ติดตั้งและเริ่มใช้งาน:
1. อัปโหลดไฟล์ทั้งหมดขึ้นโฮสต์ (ยกเว้นโฟลเดอร์ `node_modules`)
2. ในหน้าจัดการ Node.js บน cPanel คลิกปุ่ม **"Run NPM Install"** (หรือใช้ Terminal พิมพ์ `npm install`)
3. สั่งเริ่มระบบด้วยปุ่ม **"Restart"** หรือใช้คำสั่ง:
   ```bash
   npm run start
   ```
4. ข้อมูลการตรวจนับทั้งหมดจะถูกจัดเก็บเป็นไฟล์ลงในโฟลเดอร์ `./data/{job-id}/db.json` บนโฮสต์ Hostatom ของคุณโดยอัตโนมัติ

---

## 🚀 คำสั่งเริ่มต้นใช้งานทั่วไป (Commands)

```bash
# ติดตั้ง dependencies
npm install

# รันโหมดปกติ (Production)
npm start

# รันโหมดพัฒนา (Auto-reload เมื่อแก้โค้ด)
npm run dev

# รันผ่าน Docker
docker build -t stock-checker .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data --name stock-checker-app stock-checker
```
