# Tín Hiệu Sàn

*Cảnh báo sớm rủi ro niêm yết* (tên cũ: Radar Niêm Yết, Hải Đăng)

Web app cảnh báo sớm rủi ro vi phạm quy định niêm yết của doanh nghiệp phi tài chính trên HOSE và HNX.

Dự án này **độc lập hoàn toàn** với `D:\NCKH_EWS`: nó chỉ **đọc** dữ liệu từ đó, mọi file sinh ra đều nằm trong
`D:\EWS_Radar`. Không có file nào trong `D:\NCKH_EWS` bị tạo, sửa, xóa hay đổi tên.

## Chạy app

Cần Node.js 18+ và Python 3.11+ (pandas, scikit-learn).

```bash
cd D:\EWS_Radar\app
npm install          # lần đầu
npm run build        # đóng gói vào app/dist
npm run preview      # mở http://localhost:4173
```

Hoặc nhấp đúp `start.bat`. Khi phát triển giao diện: `npm run dev` (http://localhost:5173, tự tải lại khi sửa code).

`app/dist` là một website tĩnh hoàn chỉnh: có thể đưa lên bất kỳ dịch vụ host tĩnh nào (Netlify, Vercel, GitHub Pages,
máy chủ nội bộ) mà không cần cấu hình thêm.

## Cập nhật dữ liệu

```bash
cd D:\EWS_Radar
python pipeline/build_data.py                   # đọc D:/NCKH_EWS, ghi app/public/data
python pipeline/build_data.py --refresh-text    # quét lại toàn bộ văn bản BCTN (~3 phút)
python pipeline/build_data.py --src E:/ban_sao  # dùng một bản sao dữ liệu khác
```

Sau đó chạy lại `npm run build`. Hoặc nhấp đúp `update_data.bat`.

## Tính năng

| Trang | Nội dung |
|---|---|
| Tổng quan | KPI, sự kiện theo năm và nhóm E1–E7, biện pháp, top doanh nghiệp rủi ro, sự kiện mới nhất |
| Sàng lọc rủi ro | Lọc theo sàn, ngành, mức rủi ro, trạng thái; sắp xếp; xuất CSV |
| Hồ sơ doanh nghiệp | Điểm tuân thủ / tài chính, yếu tố tác động, lịch sử điểm, dòng thời gian sự kiện kèm văn bản gốc, hồ sơ BCTN, tín hiệu ngôn ngữ, số liệu tài chính đã kiểm chứng |
| Sự kiện xử lý | 1.694 sự kiện, lọc theo nhóm/biện pháp/cơ quan/năm, liên kết văn bản gốc, xuất CSV |
| Phân tích ngành | Tỷ lệ vi phạm theo ngành, bản đồ nhiệt ngành × năm |
| So sánh | Đặt tối đa 4 doanh nghiệp cạnh nhau |
| Theo dõi | Danh sách cá nhân (lưu trên trình duyệt) |
| Phương pháp | Độ chính xác mô hình, trọng số, phạm vi dữ liệu, giới hạn sử dụng |

Phím tắt: `Ctrl K` hoặc `/` để tìm nhanh mã/doanh nghiệp. Giao diện sáng/tối, dùng tốt trên điện thoại.

## Điểm rủi ro

Hai mô hình hồi quy logistic: **tuân thủ** (E1, E3, E4, E7) và **tài chính** (E2, E5, E6), dự báo xác suất phát sinh
sự kiện trong 12 tháng sau thời điểm đánh giá. Đầu vào: lịch sử xử lý, trạng thái cảnh báo hiện hành, độ trễ và định
dạng công bố BCTN, tín hiệu ngôn ngữ trong phần thuyết minh BCTN. Kiểm định walk-forward 2019–2024: AUC ≈ 0,70
(tuân thủ) và 0,75 (tài chính); nhóm 10% điểm cao nhất có tỷ lệ vi phạm gấp ~3,4–3,7 lần trung bình.

Đây là mô hình phục vụ sản phẩm, **tách biệt với mô hình nghiên cứu** trong NCKH_EWS (khác mẫu huấn luyện, khác đặc
trưng). Không dùng kết quả của app này làm kết quả nghiên cứu.

## Cấu trúc

```
EWS_Radar/
├── pipeline/build_data.py   # đọc dữ liệu (chỉ đọc) → tính đặc trưng, mô hình → JSON
├── pipeline/cache/          # bộ nhớ đệm đặc trưng văn bản (xóa được, tự tạo lại)
└── app/                     # React + TypeScript + Vite + ECharts
    ├── public/data/         # JSON do pipeline sinh ra
    └── src/{pages,components,lib}
```

## Nguồn dữ liệu đọc từ NCKH_EWS

`data/processed/sample_frame_v2.csv`, `origin.csv`, `pdf_frame_v2.csv` · `labels/labels_Y1_Y2.csv`,
`events_master_final.csv` · `data/interim/sections/*.json.gz` (văn bản đã xóa dữ liệu cá nhân) ·
`data/interim/bctc_gop/bctc_gop_rong.csv` · `data/raw/listing/vietstock_*_20261001.csv`.

App không hiển thị toàn văn BCTN, chỉ các chỉ số tổng hợp và từ khóa.
