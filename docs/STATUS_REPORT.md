# Báo cáo hiện trạng — Meo Meo Caro

Ngày rà soát: 2026-11-05. Phạm vi: toàn bộ mã nguồn, test, tài liệu và cấu hình triển khai tại thời điểm bàn giao. Báo cáo này chỉ dựa trên đọc mã và chạy thử; chưa sửa mã nguồn.

## 1. Tóm tắt 10 dòng

1. Dự án chạy được, `npm test` qua **78/78** test trên SQLite tạm; server `/health` trả 200; chặn thiếu/yếu `SESSION_SECRET` ở production đúng.
2. Bàn cờ đã được thu gọn còn **3×3 và ∞** ở `public/js/game-core.js`, `storage.js`, `main.js`; giao diện chỉ hiện 2 lựa chọn (đã kiểm bằng trình duyệt).
3. Online 2 trình duyệt, tài khoản, lưu ván, lịch sử, xem lại, thống kê và link mời hoạt động; bản QA cũ chỉ dừng ở bước chọn cỡ 4×4 đã bị xoá.
4. Phần lớn yêu cầu của đợt nâng cấp #3 đã có và có test thật: scrypt, cookie httpOnly, CSRF, rate limit, SQLite/PostgreSQL, migration có version, lưu ván idempotent, chặn người ngoài xem replay.
5. **Lỗi lệch yêu cầu rõ nhất:** API lịch sử/thống kê vẫn trả các ván 4×4–8×8 cũ; chi tiết replay của ván cũ vẫn mở được. Yêu cầu là giữ dữ liệu nhưng ẩn khỏi API.
6. **Lỗi hợp đồng cỡ bàn:** `room:create` từ chối cả chuỗi `"3"` và trả mã `invalidSize`, trong khi yêu cầu là chấp nhận `3`/`"3"`/`"infinite"` và trả `UNSUPPORTED_BOARD_SIZE` cho giá trị khác.
7. Dấu vết 4×4–8×8 còn trong README (nhiều dòng), comment `server.js`, tên test, guard `ui.js` và một lượng lớn mã AI bàn lớn không còn đường gọi.
8. Tài liệu tự mâu thuẫn: README ghi 31 test AI + 32 test server (tổng 85), thực tế 27 + 29 (tổng 78); nhiều kịch bản thủ công vẫn mô tả 4×4–8×8.
9. Bảo mật cơ bản tốt: không thấy bí mật thật trong git; SQL tham số hoá; avatar/tên được whitelist/sanitize; XSS qua tên người chơi không thấy.
10. Không có lỗi mức “Nghiêm trọng”; các việc còn lại chủ yếu là dọn dẹp, siết hợp đồng API và đồng bộ tài liệu.

## 2. Thay đổi của công cụ khác và mâu thuẫn

- **Đã thu gọn cỡ bàn tại lõi.** `public/js/game-core.js` chỉ còn `BOARD_CONFIGS = { 3: { winLength: 3 } }`, `MIN_BOARD_SIZE = MAX_BOARD_SIZE = 3`, `INFINITE.winLength = 5`. `main.js` suy ra `BOARD_SIZES` từ đây nên UI chỉ còn 3 và ∞. Không còn hai hằng luật thắng mâu thuẫn.
- **Đã dọn storage và manifest.** `public/js/storage.js` chỉ nhận `[3]` + `'infinite'`; `public/manifest.json` mô tả “3x3 và bàn vô cực”.
- **Đã tăng cache service worker** lên `meo-meo-caro-v6` và danh sách app shell không còn file đã xoá (`public/sw.js:5`).
- **Đã siết lọc lịch sử theo cỡ bàn** ở `history.js:10-15`: chỉ nhận `3` hoặc `infinite`. Tuy nhiên danh sách không lọc thì vẫn trả ván 4–8 cũ.
- **Còn mã AI bàn lớn chết.** `public/js/ai.js` vẫn giữ `evaluateBoard`, `minimaxLarge`, `searchLarge`, `chooseEasyLarge/MediumLarge/HardLarge`, `depthFor` (khoảng dòng 149–468) và nhánh lớn trong `chooseMove` (dòng 827–853), dù UI/server không còn tạo bàn 4–8.
- **Mâu thuẫn tài liệu.** README vẫn mô tả 4×4–8×8, luật 4/5 quân, timer 45 giây cho 5×5+, 85 test; mã hiện tại chỉ có 3×3 (30 giây), ∞ (45 giây) và 78 test.
- **Mâu thuẫn mã lỗi.** Server trả `invalidSize` (`server.js:572`); yêu cầu bàn giao ghi `UNSUPPORTED_BOARD_SIZE`.
- **Không thấy hai module auth/DB trùng nhau.** Chỉ có một `auth.js`, một `db.js`, một `history.js`; tên sự kiện Socket.IO giữa client và server khớp nhau (đã đối chiếu danh sách emit/on).

## 3. Bảng tính năng

| Tính năng | Trạng thái | Bằng chứng |
| --- | --- | --- |
| AI 3×3 dễ/vừa/khó | Đã xong (đã kiểm chứng) | `test/ai.test.mjs` các test AI 3×3; smoke bấm AI dễ và AI nhận nước |
| AI khó 3×3 không thể thua | Đã xong (đã kiểm chứng) | Test duyệt cạn 1164 thế kết thúc, 0 thua (`test/ai.test.mjs`) |
| 2 người cùng máy | Đã xong (đã kiểm chứng) | `playLocalMove` trong `main.js`; smoke chơi hết ván, có win line |
| Online mã 5 ký tự, loại 0/O/1/I/L | Đã xong (đã kiểm chứng) | `ROOM_ALPHABET` ở `server.js:156`; test 8/12/29 và QA 2 trình duyệt |
| Server là nguồn sự thật | Đã xong (đã kiểm chứng) | `game:move` kiểm tra phòng/lượt/ô/toạ độ (`server.js:728-780`); test 3–5, 19–23 |
| Timer, tự đánh khi hết giờ, đấu lại, emote, rejoin | Đã xong (đã kiểm chứng) | Test server 5–11, 24–25; `turnMsFor` 30s/45s (`server.js:162-165`) |
| VI/EN | Đã xong (đã kiểm chứng) | 278 key mỗi ngôn ngữ, không lệch; smoke đổi EN, không tràn 360px |
| Âm thanh Web Audio | Đã xong (đã kiểm chứng một phần) | `public/js/audio.js` tạo context sau tương tác; chưa đo âm thanh thực tế |
| PWA offline chơi với máy | Đã xong (đã kiểm chứng) | Smoke: tắt mạng, reload, vào AI 3×3 và đánh được một nước |
| Hình mèo SVG nội bộ | Đã xong (đã kiểm chứng) | `public/assets/cats.js`; không có ảnh/font nhân vật bên ngoài |
| Chỉ còn cỡ 3×3 và ∞ | Đã xong (đã kiểm chứng) | `game-core.js`; smoke đọc danh sách nút = `3, infinite` |
| Luật thắng 3×3 = 3, ∞ = 5 | Đã xong (đã kiểm chứng) | `winLengthFor`; test thắng 4 hướng và overline ∞ |
| Không vòng mép bàn | Đã xong (đã kiểm chứng) | `checkWinInfinite` quét toạ độ nguyên; test toạ độ âm/overline |
| Bàn ∞ thưa, khung 9×9, nới 2 ô, giới hạn 2000 | Đã xong (đã kiểm chứng) | `INFINITE` trong `game-core.js`; test vùng mở rộng và hòa kỹ thuật |
| Canvas ∞: kéo/zoom/center/last, win line | Đã xong (đã kiểm chứng một phần) | Nút zoom/center/last chạy trong smoke; win line ∞ mới kiểm ở logic, chưa ở trình duyệt |
| Online ∞ nhận `{x,y}` và kiểm vùng | Đã xong (đã kiểm chứng) | Test server 18–23; `server.js:736-768` |
| AI ∞ chạy worker, trả nước hợp lệ | Đã xong (đã kiểm chứng) | Test AI ∞; smoke AI ∞ trả lời trong canvas |
| Đăng ký/đăng nhập/đăng xuất/hồ sơ/mật khẩu/xoá mềm | Đã xong (đã kiểm chứng) | 15 test `test/auth.test.mjs` |
| scrypt + session token hash + cookie flags + CSRF + rate limit | Đã xong (đã kiểm chứng) | `auth.js:13,51-79,145-163,220-280`; test auth 1, 6–13 |
| PostgreSQL và SQLite, migration có version | Đã xong (đã kiểm chứng) | `db.js:16-73,82-195`; test auth 14; `npm test` chạy SQLite thật |
| SQL tham số hoá 100% | Đã xong (đã kiểm chứng) | Không ghép input người dùng vào SQL; `history.js` chỉ ghép mệnh đề cố định |
| Socket xác thực bằng cookie, một tài khoản một ghế | Đã xong (đã kiểm chứng) | `auth.js:199-202`, `server.js:643`; test server 27–28 |
| Lưu ván một lần, stats cùng transaction | Đã xong (đã kiểm chứng) | `history.js:228-295`; test history 6 |
| Khách đấu khách không lưu | Đã xong (đã kiểm chứng) | `saveMatchRecord` bỏ qua khi không có userId; test history 1 |
| Người ngoài nhận 404 khi xem replay | Đã xong (đã kiểm chứng) | `history.js:159-167`; test history 3 |
| Phân trang/lọc lịch sử, replay, thống kê | Đã xong (đã kiểm chứng) | Test history 3–5; QA bấm first/next/last/autoplay, đếm win line |
| Link mời giữ phòng sau đăng ký | Đã xong (đã kiểm chứng) | QA 2 trình duyệt: mở link, đăng ký, tự vào phòng |
| Cảnh báo localhost khi mời | Đã xong (đã kiểm chứng) | `isLocalOnlyHost`/`inviteLocalNote` trong `main.js` |
| Đánh thức server khi cold start | Đã xong (đã kiểm chứng một phần) | `ensureOnline` retry tới 90 giây (`main.js:769-789`); chưa mô phỏng cold start thật |
| Ẩn ván 4×4–8×8 cũ khỏi API | **Có nhưng lỗi** | `history.js:108-145` không thêm điều kiện `size IN ('3','infinite')`; `stats` dòng 175–207 vẫn gộp size cũ; `history/:id` vẫn trả ván cũ |
| Chấp nhận `3`, `"3"`, `"infinite"`; mã `UNSUPPORTED_BOARD_SIZE` | **Có nhưng lỗi** | `server.js:566-574`: `isValidSize("3")` là false, mã trả là `invalidSize` |
| Không còn dấu vết 4×4–8×8 | **Làm một phần** | README, comment `server.js:140`, `test/ai.test.mjs:2,154`, `ui.js:168,204`, mã AI bàn lớn |
| README/deploy khớp thực tế | **Làm một phần** | `render.yaml`, `.env.example` đúng; README còn nhiều dòng 4–8 và số test 85 |

## 4. Kết quả chạy thật

- `npm install`: “up to date”, không lỗi.
- `npm test`: **78 passed, 0 failed** — `ai` 27, `server` 29, `auth` 15, `history` 7. Không có test bị skip; không thấy `assert.ok(true)`.
- Dev server `PORT=3210`: `/health` → 200 `{"status":"ok"}`; `/` → 200.
- `NODE_ENV=production` thiếu `SESSION_SECRET`: thoát mã 1, có thông báo yêu cầu biến này. Secret ngắn hơn 32 ký tự: thoát mã 1.
- Smoke trình duyệt mới (Chrome headless, 8 mục): danh sách cỡ bàn chỉ `3, infinite`; local 3×3 kết thúc có win line; AI 3×3 trả lời; ∞ local nhận phím Enter/ArrowRight; ∞ AI trả lời; EN + 360px không tràn; offline PWA chơi được; không có lỗi console/pageerror (bỏ qua cảnh báo mạng khi offline).
- QA cũ 2 trình duyệt: qua 9 mục đầu (health, đăng ký, tạo phòng, preview lời mời, cả hai vào game, chơi hết ván, lịch sử, replay, thống kê), rồi dừng vì harness còn bấm nút `data-size="4"` đã bị xoá. Đây là harness lỗi thời, không phải app lỗi.
- Quét bí mật: không có `.env`, `node_modules`, `data/` hay file DB trong git; chỉ có placeholder `postgresql://user:***@host/db` trong README. Không in giá trị bí mật nào.
- Đã dừng server thử và kiểm tra không còn tiến trình `node server.js` sót.

## 5. Lỗi và rủi ro theo mức độ

### Nghiêm trọng

- Không phát hiện.

### Cao

1. **API lịch sử/thống kê vẫn lộ ván 4×4–8×8 cũ** — `history.js:108-145` (danh sách), `history.js:175-207` (stats), `history.js:153-172` (chi tiết). Trái yêu cầu “giữ dữ liệu nhưng ẩn khỏi API”. Sửa: thêm `m.size IN ('3','infinite')` vào danh sách/chi tiết; lọc `size_key IN ('3','infinite')` khi thống kê; thêm test chèn thẳng bản ghi size `4`.

### Trung bình

2. **Sai hợp đồng cỡ bàn khi tạo phòng** — `server.js:566-574`. `"3"` bị từ chối; mã lỗi là `invalidSize` thay vì `UNSUPPORTED_BOARD_SIZE`. Sửa: chuẩn hoá `3`/`"3"`/`"infinite"`; trả mã mới; thêm key i18n VI/EN; cập nhật test server 12.
3. **README mô tả tính năng đã xoá và sai số test** — `README.md:23,30,145,169,185,282-283,311-324,330,346,352,357`. Sửa toàn bộ sang 3×3 + ∞, 78 test, timer 30/45 giây, bỏ kịch bản 4–8.
4. **Mã AI bàn lớn chết nhưng vẫn được build/tải** — `public/js/ai.js:149-468,827-853`; `ai-client.js:126`; test/comment còn nhắc 4×4. Không gây lỗi chạy nhưng là dấu vết và tăng rủi ro bảo trì. Sửa: xoá nhánh lớn, giữ minimax 3×3 + AI ∞; xoá test 4×4.

### Thấp

5. **`ui.js` còn suy luận cỡ bàn 3–8 và class `board-compact`** — `public/js/ui.js:168,204`. Sửa: chỉ nhận 3; bỏ class chết.
6. **`refreshAccount` nuốt lỗi mạng và chuyển thành khách** — `main.js:442-452`. Khi Render cold start quá 12 giây, người dùng trông như bị đăng xuất. Có thể thử lại có giới hạn và hiện `wakingServer`.
7. **PostgreSQL `rejectUnauthorized: false`** — `db.js:153`. Tiện cho Render/Neon nhưng bỏ kiểm chứng chứng chỉ; nên cho phép cấu hình CA nếu triển khai nghiêm ngặt.
8. **Xoá mềm không ẩn danh tên trong bảng `matches`** — `auth.js:460-470` chỉ đổi `users`; API đã che bằng `history.js:33-77` nhưng dữ liệu gốc vẫn còn. Rủi ro riêng tư nếu lộ DB.
9. **Migration không có khoá liên tiến trình** — `db.js:218-244`. Hai instance khởi động cùng lúc có thể tranh nhau tạo bảng; hiện phù hợp một instance Render.
10. **QA cũ còn trong `/tmp/mmc-e2e`** — không nằm trong repo nhưng cần dọn ở cuối.

## 6. Kế hoạch tiếp tục (ưu tiên)

### Nhỏ

- Sửa `server.js` chuẩn hoá `3`/`"3"`/`"infinite"` + mã `UNSUPPORTED_BOARD_SIZE`; thêm i18n và test.
- Lọc ván cũ khỏi danh sách/chi tiết/thống kê; thêm test chèn bản ghi size `4`.
- Xoá test 4×4 và tiêu đề “3x3 - 8x8”; sửa comment timer; sửa `ui.js`.
- Xoá mã AI bàn lớn chết; giữ nguyên hành vi 3×3/∞ đã có test.
- Cập nhật README: cỡ bàn, timer, số test, kịch bản thủ công, mục “Đã làm sau bàn giao”.

### Trung bình

- Chạy lại toàn bộ test, smoke 3×3/∞, VI/EN, 360px/desktop, offline PWA, online 2 trình duyệt với cả 3×3 và ∞.
- Dọn `/tmp/mmc-e2e` và screenshot QA; kiểm tra lần cuối không có `data/`/`.env` trong git.
- Cân nhắc retry `refreshAccount` và thông báo đánh thức server.

### Lớn

- Không bắt buộc cho phạm vi bàn giao. Nếu chạy nhiều instance: khoá migration PostgreSQL và Redis adapter/room store (đã ghi trong README hướng nâng cấp).

## 7. Câu hỏi thực sự chưa quyết

Không có câu hỏi chặn. Các quyết định sản phẩm đã chốt (chỉ 3×3 và ∞, khách vẫn chơi, không quên mật khẩu qua email, phòng trong RAM, Render + PostgreSQL) đủ để tiếp tục. Các ván 4–8 cũ sẽ được giữ trong DB và chỉ ẩn khỏi API, không xoá dữ liệu.

## 8. Đã làm sau bàn giao (Pha 3)

Sao lưu trước khi sửa: commit `8eb565b` và tag `backup-before-handover`; `.env`, `node_modules`, `data/` không được đưa vào commit.

### 8.1. Hợp đồng cỡ bàn

- `public/js/game-core.js`: thêm `normalizeBoardSize(size)` chỉ nhận `3`, `"3"` và `"infinite"`, trả `null` cho mọi giá trị khác; bỏ hai hằng không dùng `MIN_BOARD_SIZE`/`MAX_BOARD_SIZE`.
- `server.js`: `room:create` dùng `normalizeBoardSize`; giá trị không hỗ trợ trả `UNSUPPORTED_BOARD_SIZE` thay vì `invalidSize`; `createRoom` chuẩn hoá phòng thủ; sửa comment timer thành 3×3 = 30 giây, ∞ = 45 giây.
- `public/js/i18n.js`: thêm `unsupportedBoardSize` cho VI/EN (279 key mỗi ngôn ngữ, không lệch).
- `public/js/main.js`: ánh xạ `UNSUPPORTED_BOARD_SIZE` sang chuỗi mới.
- `test/server.test.mjs`: kiểm tra `"3"` được chấp nhận, các giá trị `9, 2, 4, 5, 6, 7, 8, 3.5, "4", "Infinite", 0, -3, true, []` bị từ chối với `UNSUPPORTED_BOARD_SIZE`.

### 8.2. Ẩn ván 4×4–8×8 cũ khỏi API

- `history.js`: thêm điều kiện `m.size IN ('3', 'infinite')` cho danh sách và chi tiết; thống kê chỉ đọc `size_key IN ('3', 'infinite')`. Dữ liệu cũ vẫn nguyên trong bảng `matches`/`user_stats`, không xoá.
- `test/history.test.mjs`: chèn trực tiếp một ván size `4` và một dòng `user_stats` size `4` vào SQLite; kiểm tra danh sách/tổng/thống kê không đổi, chi tiết trả `404 MATCH_NOT_FOUND`, `GET /api/history?size=4` trả `400 INVALID_SIZE`.

### 8.3. Dọn dấu vết bàn lớn

- `public/js/ai.js`: xoá toàn bộ nhánh chấm điểm/tìm kiếm cho bàn 4–8 (`evaluateBoard`, `minimaxLarge`, `searchLarge`, `chooseEasyLarge/MediumLarge/HardLarge`, `depthFor`, ...); `chooseMove` chỉ nhận bàn 9 ô và dùng minimax 3×3; giữ nguyên AI ∞.
- `public/js/ai-client.js`: mọi yêu cầu hữu hạn chạy trực tiếp trên luồng chính (chỉ còn 3×3); worker chỉ xử lý ∞.
- `public/js/ai-worker.js`: chỉ còn đường ∞, không còn import `chooseMove`.
- `public/js/ui.js`: bỏ class `board-compact` và giới hạn suy luận cỡ bàn còn đúng 3.
- `public/sw.js`: tăng cache lên `meo-meo-caro-v7`, app shell không chứa file đã xoá.
- `test/ai.test.mjs`: bỏ khối hòa 4×4 và import `isDraw`; thêm test 3×3 chứng minh chuỗi chỉ số 1–2–3 không thắng vì vắt qua cuối hàng.
- `README.md`: cập nhật toàn bộ mô tả cỡ bàn, timer, PWA cache, số test (79), mô tả 4 bộ test và 14 kịch bản thủ công liên quan.

### 8.4. Kết quả kiểm chứng lại

- `npm test`: **79 passed, 0 failed** — `ai` 27, `server` 29, `auth` 15, `history` 8. Chạy trên SQLite tạm riêng cho từng bộ.
- Smoke trình duyệt Chrome headless, 10 mục: chỉ có nút 3×3/∞; ván 3×3 local kết thúc có win line; AI 3×3 trả lời; ∞ local nhận phím và nút zoom/center/last; AI ∞ trả lời; **online 3×3 hai context trình duyệt chơi hết ván**; **online ∞ hai context đánh 2 nước, F5 khôi phục đúng 2 nước**; EN + 360px không tràn; offline PWA chơi AI được; không có lỗi console/pageerror (bỏ qua cảnh báo mạng khi offline).
- Đã dừng server thử, xoá thư mục QA tạm `/tmp/mmc-e2e` và các ảnh chụp QA; không còn tiến trình `node server.js` sót.

### 8.5. Việc vẫn để mở (không chặn bàn giao)

- `refreshAccount` vẫn coi lỗi mạng là khách tạm thời (`main.js:442-452`); khi Render cold start dài, người dùng có thể thấy mình bị đăng xuất cho tới lần tải sau.
- `db.js` dùng `rejectUnauthorized: false` cho PostgreSQL khi bật SSL; phù hợp Render/Neon nhưng chưa hỗ trợ CA riêng.
- Xoá mềm ẩn danh bảng `users` nhưng tên gốc vẫn nằm trong ảnh chụp của bảng `matches`; API đã che, dữ liệu gốc chỉ lộ nếu database bị truy cập trực tiếp.
- Migration chưa có khoá liên tiến trình; phù hợp mô hình một instance hiện tại.

---

## Cập nhật đợt nâng cấp #5 — email, quên mật khẩu, server đang ngủ (2026-11-05)

Phần trên là ảnh chụp bàn giao trước đợt #5. Đợt này sửa tại chỗ, giữ tương thích ngược và không xoá dữ liệu người dùng.

### Việc tồn đọng đã xử lý

1. **`refreshAccount` không còn tự đăng xuất khi lỗi mạng.** Logic được tách sang `public/js/wake.js`: lỗi `NETWORK`/`HTTP_0`/5xx được thử lại với backoff 1.2s → 1.9s → 3.1s … tối đa 10s/lần, tổng ~90 giây, hiện banner "đang đánh thức server". Chỉ `401` hoặc `{user:null}` mới chuyển về khách. Không thử lại khi `navigator.onLine === false` để PWA offline mở nhanh. Màn hình `#reset=`/`#verify=` dùng cùng helper nên cũng chờ server thay vì báo lỗi ngay.
2. **Xoá tài khoản ẩn danh cả ảnh chụp tên trong `matches`.** Trong cùng transaction với xoá mềm `users`, cập nhật `player_a_name`/`player_b_name` thành "Người chơi đã xóa" cho mọi ván người đó tham gia. Bản ghi `users` vẫn được giữ, email và toàn bộ token bị xoá; đối thủ vẫn xem lịch sử bình thường.

### Phạm vi mới

- `mailer.js`: provider `console`/`smtp` (nodemailer)/`resend` (fetch)/`test` (outbox), `sendMail` không bao giờ ném lỗi và thử lại một lần; mẫu thư VI/EN; link luôn từ `PUBLIC_URL`.
- Migration `002_email_auth`: cột `email`, `email_verified_at`, `pending_email`; bảng `email_verifications`, `password_resets`; partial unique index cho email đã xác thực; index hết hạn.
- API: `GET /api/config`; đăng ký kèm email; `POST /api/auth/forgot-password`, `/reset-password/check`, `/reset-password`, `/verify-email`; `POST /api/me/email`, `/me/email/resend`; `/api/auth/me` thêm `emailMasked`, `pendingEmailMasked`, `emailVerified`, `hasPendingEmail`.
- Token 32 byte base64url, DB chỉ lưu SHA-256, dùng một lần trong transaction; yêu cầu mới vô hiệu hoá token cũ; hạn mặc định 30 phút (reset) và 24 giờ (xác thực).
- Rate limit: quên mật khẩu 5/IP/giờ + 3/email/giờ (vượt email vẫn trả generic), kiểm tra reset 10/IP/15 phút, resend 3/tài khoản/giờ, đổi email 5/tài khoản/giờ.
- Giao diện VI/EN: ô email đăng ký, banner nhắc xác thực (bỏ qua 7 ngày qua localStorage có try/catch), màn quên/đặt lại/xác thực, đếm ngược 60 giây, hồ sơ có email che, huy hiệu xác thực, email chờ xác thực và form đổi email cần mật khẩu hiện tại.
- `scripts/admin-reset-password.js`: in link đặt lại cục bộ cho tài khoản không có email xác thực; không gọi API, không ghi token vào log ứng dụng.
- Service worker `meo-meo-caro-v9` thêm `wake.js`; vẫn không cache `/api/*`, `/socket.io/*`, `/health`.
- Tài liệu: README, `.env.example`, `render.yaml` mô tả `PUBLIC_URL`, provider, SMTP/Resend, hạn token và cách xử lý sự cố.

### Kiểm thử

- `npm test`: **108 test, 0 lỗi** trên SQLite tạm (ai 27, wake 8, server 29, auth 15, history 8, password-reset 21).
- `test/password-reset.test.mjs` chạy server thật với `MAIL_PROVIDER=test`; kiểm tra token chỉ có trong thư, DB chỉ lưu hash, link không theo Host giả, phản hồi quên mật khẩu đồng nhất, dùng lại/hết hạn token, hai request đồng thời, rate limit, đổi email, xoá tài khoản và ẩn danh tên trong lịch sử, không lộ token trong log/response.
- `test/wake.test.mjs` kiểm tra backoff, giới hạn 90 giây, offline, 4xx không thử lại và quy tắc giữ đăng nhập.

### Giới hạn còn lại

- Chưa có đăng nhập bằng email/OAuth; email chỉ để xác thực và khôi phục.
- Gửi thư phụ thuộc nhà cung cấp bên ngoài; Gmail có giới hạn/ngày, Resend yêu cầu xác minh domain.
- Ứng dụng vẫn chạy một instance; phòng online nằm trong RAM.
- Bộ test tự động chạy SQLite; PostgreSQL cần chạy tay với `DATABASE_URL` test nếu muốn xác nhận.

---

## Rà soát trước khi thêm Đi lại

> **Cập nhật sau khi thêm Đi lại (2026-11-08):** tính năng đã hoàn tất và có test; xem `README.md` mục **Đi lại (Undo)** và `docs/FEATURES.md` mục 4/8/11 để biết sự kiện, mã lỗi và giới hạn mới. Các ghi nhận bên dưới là ảnh chụp **trước** khi thêm tính năng, giữ nguyên để đối chiếu. (2026-11-08)

Phạm vi: đọc lại mã hiện tại, chạy `npm test`, chạy server thật và smoke trình duyệt trên bản có 108 test. Không sửa mã nguồn trong bước này.

### Kết quả chạy thật

- `npm test`: **108/108 đạt** — ai 27, wake 8, server 29, auth 15, history 8, password-reset 21.
- Server dev cổng 3210 (SQLite tạm): `GET /health` → 200 `{"status":"ok"}`; `GET /api/config` → `{"ok":true,"mailEnabled":true}` (đúng vì `MAIL_PROVIDER=console` ngoài production).
- Smoke trình duyệt: trang chủ, chọn chế độ, AI 3×3 (máy đi trước, bàn khoá khi đang nghĩ rồi trả nước), 2 người cùng máy (đánh 3 nước, đổi lượt đúng). Không thấy lỗi console/pageerror.
- Hợp đồng cỡ bàn đã đúng: `normalizeBoardSize` nhận `3`, `"3"`, `"infinite"`; giá trị khác trả `UNSUPPORTED_BOARD_SIZE` (`server.js:568-573`).
- Lịch sử/thống kê đã ẩn ván 4×4–8×8: `VISIBLE_SIZES` và `size_key IN ('3','infinite')` (`history.js:110,161,181`).

### Lỗi và rủi ro liên quan trực tiếp tới Đi lại

| Mức | Vấn đề | Bằng chứng | Hướng xử lý |
| --- | --- | --- | --- |
| Chặn tính năng | Ván 3×3 phía client không lưu danh sách nước đi; chỉ có `board` bị sửa tại chỗ | `main.js` `startAIGame`/`startLocalGame`/`playLocalMove` | Thêm `game.moves` dạng `{i,s}`, dựng bàn lại từ `moves` |
| Chặn tính năng | `computeRegion(moves)` chỉ mở rộng, không thu nhỏ | `game-core.js` `computeRegion` | Tính vùng từ đầu mỗi lần dựng lại; undo có thể làm vùng nhỏ lại |
| Chặn tính năng | Server không có trạng thái/khóa cho yêu cầu đi lại | `server.js` `createRoom`, `publicState`, `game:move` | Thêm `room.undo`, bộ đếm, cooldown, timer; chặn `game:move` khi đang chờ |
| Chặn tính năng | Client online chưa chuyển tiếp sự kiện undo | `online.js` `FORWARDED_EVENTS` | Thêm `undo:requested`, `undo:resolved` và 3 method mới |
| Chặn tính năng | Chưa có giao diện nút "Đi lại"/"Xin đi lại", dialog, banner, hiệu ứng | `index.html` màn chơi; `ui.js` | Thêm nút ≥44px, `alertdialog`, banner, hiệu ứng biến mất |
| Cao | Lịch sử dùng `moveLog`; nếu undo chỉ sửa bàn mà không cắt `moveLog`/`moves` thì replay sai | `history.js` `matchMoves`, `saveMatchRecord` | Cắt cả hai ngay khi chấp nhận undo |
| Cao | AI có thể trả kết quả muộn sau khi người chơi bấm đi lại | `main.js` `scheduleAIMove` | Tăng token, hủy worker/timer, kiểm tra lại trước khi áp dụng |
| Cao | Timer lượt đang chạy trong lúc chờ đối thủ trả lời | `server.js` vòng `setInterval` dùng `turnDeadline` | Đặt `turnDeadline=null` khi chờ, khôi phục đủ thời gian khi xong |
| Trung bình | F5 khi đang chờ sẽ mất dialog nếu chỉ dựa vào sự kiện tạm | `publicState` chưa có `undo` | Đưa `undo` + số lượt còn lại vào `room:state` |
| Trung bình | Đóng phòng/ngắt kết nối có thể để timer undo sót | `destroyRoom`, `markDisconnected` | Hủy timer undo ở mọi nhánh kết thúc |
| Trung bình | Chưa có hiệu ứng quân biến mất, chưa tôn trọng giảm chuyển động | `ui.js` `renderBoard` | Lớp phủ SVG mờ dần ~200ms, bỏ qua nếu `prefers-reduced-motion` |
| Thấp | Service worker còn cache cũ nếu thêm file/JS mới | `public/sw.js` `meo-meo-caro-v9` | Tăng version, thêm file mới, không giữ file đã xoá |
| Thấp | Phòng online nằm trong RAM, mất khi restart | `server.js` `rooms` | Giới hạn đã biết, không xử lý trong đợt này |

### Ghi chú thiết kế

- Server đã có `room.moveLog` cho cả hai cỡ bàn và giới hạn 2000 nước; có thể dùng làm nguồn sự thật duy nhất cho undo.
- `state.ai.token` và `aiClient.cancel()` đã có sẵn cơ chế chống kết quả AI cũ; chỉ cần gọi đúng chỗ.
- `publicState(room, youKey)` đã nhận danh tính người xem, thuận tiện để trả `isYou`, số lượt xin còn lại và cooldown riêng.
