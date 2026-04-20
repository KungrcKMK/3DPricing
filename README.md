# 3D Print Pricing Calculator

เว็บแอปคำนวณราคางานพิมพ์ 3 มิติแบบ Instant Quote — อัปโหลดไฟล์ STL คำนวณปริมาตรและราคาอัตโนมัติ

## Live Demo
https://kungrckmk.github.io/3DPricing/

## ฟีเจอร์

- อัปโหลดไฟล์ STL (Binary/ASCII) — parse ปริมาตร, ขนาด, triangle ในเบราว์เซอร์
- รองรับ 3 เทคโนโลยี: **FDM · SLA · SLS**
- ปรับค่าได้: วัสดุ, Layer Height, Infill %, จำนวน
- ใส่ค่าจริง: กำลังไฟเครื่อง (W), ค่าไฟ (฿/kWh), ค่าแรงงาน (฿/ชม.)
- สร้างใบเสนอราคา (พิมพ์/Save PDF ผ่านเบราว์เซอร์)

## สูตรคำนวณ

```
น้ำหนัก     = ปริมาตร × ความหนาแน่น × (shell 15% + infill% × 85%)
เวลาพิมพ์    = น้ำหนัก ÷ อัตราพิมพ์ × (0.20 ÷ layer)

ค่าเส้น     = น้ำหนัก × ราคา/กรัม × 1.05 (waste)
ค่าไฟ       = (W × time ÷ 1000) × ฿/kWh
ค่าแรง      = time × ฿/ชม.
รวม         = (เส้น + ไฟ + แรง) × จำนวน
```

## วิธีรัน local

```bash
node server.js
# เปิด http://localhost:5173
```

ไม่มี dependency — ใช้ Node.js standard library เท่านั้น

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | UI |
| `style.css` | สไตล์ |
| `script.js` | Logic คำนวณ + ใบเสนอราคา |
| `stl-parser.js` | Parser ไฟล์ STL |
| `server.js` | Static file server |

## License

MIT
