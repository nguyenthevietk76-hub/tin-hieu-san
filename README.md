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
python pipeline/fetch_fin.py                    # tải BCTC năm từ Vietcap (VCI) vào pipeline/ext (~35 phút lần đầu)
python pipeline/fetch_fin.py --refresh          # tải lại toàn bộ (khi có BCTC năm mới)
python pipeline/build_data.py                   # đọc D:/NCKH_EWS + pipeline/ext, ghi app/public/data
python pipeline/build_data.py --refresh-text    # quét lại toàn bộ văn bản BCTN (~3 phút)
python pipeline/build_data.py --src E:/ban_sao  # dùng một bản sao dữ liệu khác
```

Sau đó chạy lại `npm run build`. Hoặc nhấp đúp `update_data.bat`.

## Tính năng

| Trang | Nội dung |
|---|---|
| Tổng quan | KPI, sự kiện theo năm và nhóm E1–E7, biện pháp, top doanh nghiệp rủi ro, sự kiện mới nhất |
| Sàng lọc rủi ro | Lọc theo sàn, ngành, mức rủi ro, trạng thái; sắp xếp; xuất CSV |
| Hồ sơ doanh nghiệp | Điểm tuân thủ / tài chính, yếu tố tác động, lịch sử điểm, dòng thời gian sự kiện kèm văn bản gốc, hồ sơ BCTN, tín hiệu ngôn ngữ, BCTC năm 2018–2025 (nguồn VCI) |
| Sức khỏe tài chính | BCTC năm gần nhất của mọi DN: doanh thu, LNST các năm, ROA, ROE, nợ/TS, thanh toán hiện hành, CFO/TS; cảnh báo chạm/tiệm cận ngưỡng hủy niêm yết bắt buộc (NĐ 155/2020: vốn chủ âm, lỗ lũy kế vượt vốn góp, lỗ 3 năm liên tiếp); xuất CSV |
| Sự kiện xử lý | 1.694 sự kiện, lọc theo nhóm/biện pháp/cơ quan/năm, liên kết văn bản gốc, xuất CSV |
| Phân tích ngành | Tỷ lệ vi phạm theo ngành, bản đồ nhiệt ngành × năm |
| So sánh | Đặt tối đa 4 doanh nghiệp cạnh nhau |
| Theo dõi | Danh sách cá nhân (lưu trên trình duyệt) |
| Phương pháp | Độ chính xác mô hình, trọng số, phạm vi dữ liệu, giới hạn sử dụng |

Phím tắt: `Ctrl K` hoặc `/` để tìm nhanh mã/doanh nghiệp. Giao diện sáng/tối, dùng tốt trên điện thoại.

## Điểm rủi ro

Hai mô hình hồi quy logistic: **tuân thủ** (E1, E3, E4, E7) và **tài chính** (E2, E5, E6), dự báo xác suất phát sinh
sự kiện trong 12 tháng sau thời điểm đánh giá. Đầu vào: lịch sử xử lý, trạng thái cảnh báo hiện hành, độ trễ và định
dạng công bố BCTN, tín hiệu ngôn ngữ trong phần thuyết minh BCTN, ROA và dòng tiền HĐKD / tổng tài sản từ BCTC năm
gần nhất đã công bố trước thời điểm đánh giá. Kiểm định walk-forward 2019–2024: AUC ≈ 0,71 (tuân thủ) và 0,77 (tài
chính; 0,75 khi chưa có BCTC); nhóm 10% điểm cao nhất có tỷ lệ vi phạm gấp ~3,4–3,7 lần trung bình.

Điểm hiện tại được tính tại **mốc dữ liệu** (ngày mới nhất giữa ảnh chụp danh sách niêm yết và sự kiện mới nhất), không
phải ngày chạy pipeline; `meta.json` ghi độ mới của từng nguồn trong `sources`.

Đây là mô hình phục vụ sản phẩm, **tách biệt với mô hình nghiên cứu** trong NCKH_EWS (khác mẫu huấn luyện, khác đặc
trưng). Không dùng kết quả của app này làm kết quả nghiên cứu.

## Cấu trúc

```
EWS_Radar/
├── pipeline/build_data.py   # đọc dữ liệu (chỉ đọc) → tính đặc trưng, mô hình → JSON
├── pipeline/fetch_fin.py    # tải BCTC năm từ nguồn ngoài → pipeline/ext/fin_vci.csv
├── pipeline/ext/            # dữ liệu nguồn ngoài (vci_raw/ là bản thô, tải lại được)
├── pipeline/cache/          # bộ nhớ đệm đặc trưng văn bản (xóa được, tự tạo lại)
└── app/                     # React + TypeScript + Vite + ECharts
    ├── public/data/         # JSON do pipeline sinh ra
    └── src/{pages,components,lib}
```

## Nguồn dữ liệu đọc từ NCKH_EWS

`data/processed/sample_frame_v2.csv`, `origin.csv`, `pdf_frame_v2.csv` · `labels/labels_Y1_Y2.csv`,
`events_master_final.csv` · `data/interim/sections/*.json.gz` (văn bản đã xóa dữ liệu cá nhân) ·
`data/raw/listing/vietstock_*_YYYYMMDD.csv` (tự lấy bản chụp mới nhất).

## Nguồn ngoài

BCTC năm (cân đối, kết quả kinh doanh, lưu chuyển tiền tệ) của Vietcap (VCI), tải qua thư viện `vnstock`. Có năm tài
chính 2018–2025 và 784/810 mã (thiếu một số mã đã hủy niêm yết). Đây là dữ liệu bên thứ ba, chưa đối chiếu với BCTC
gốc; `public_date` là ngày công bố theo VCI (với một số năm là ngày công bố BCTC quý 4).

App không hiển thị toàn văn BCTN, chỉ các chỉ số tổng hợp và từ khóa.
