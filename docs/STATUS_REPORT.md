# Báo cáo hiện trạng — Meo Meo Caro

Phần dưới là nhật ký cộng dồn, xem mục cuối cùng để biết hiện trạng

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

---

## Nâng cấp âm thanh, nhạc nền và hiệu ứng thắng/thua (2026-11-08)

Sao lưu trước khi sửa: tag `backup-before-audio` (commit `b39de41`) và bản nén
`/Users/tuanphong/Documents/MeoMeoCaro_backup_before_audio.tar.gz` (289 KB).

### Pha 0 — rà soát read-only bản cũ

Ảnh chụp `public/js/audio.js` tại tag dài 241 dòng; toàn bộ âm thanh đã là Web Audio,
không có file ngoài. Các điểm cần thay:

| Hành vi cũ | Bằng chứng tại tag | Hệ quả |
| --- | --- | --- |
| Một `AudioContext` toàn cục, tạo trong `ensureContext` | `audio.js:6,13-26` | Không có bus/limiter, mọi tiếng đấu trực tiếp vào `destination` |
| `unlock()` bật cờ trước khi context tồn tại | `audio.js:29-41` | Trước tương tác vẫn có thể ghi nhận "đã mở"; không có buffer im lặng cho iOS |
| Mọi lần đặt quân đều gọi cùng một `meow()` | `audio.js:70-103`; `main.js:2505,2523,2868` | Mèo cam/xám nghe giống nhau, không phân biệt quân mình/đối thủ |
| Kết quả 2 người cùng máy luôn phát `win` (kể cả hòa có `draw`) | `main.js:2566-2582` | Không có góc nhìn; hòa không có hiệu ứng ngủ |
| Kết quả online đã có góc nhìn nhưng khóa chỉ là `id:board:winner` | `main.js:3638-3656` | Ván mới trùng thế cờ có thể bị coi là cũ; thiếu vòng/số nước |
| Không có âm lượng; chỉ có hai công tắc `sound`/`music` | `storage.js:103-127`; `index.html:793-805` | Không chỉnh được nhạc to/nhỏ; `music` mặc định tắt |
| Nhạc là vòng 8 nốt cố định, lặp mỗi 1900 ms | `audio.js:191-216` | Không có cảm giác menu/ván, không fade, không nhường chỗ khi có kết quả |
| Không giới hạn voice, không ưu tiên, không log kiểm thử | `audio.js:174-186, 238-241` | Đặt nhanh có thể chồng tiếng; không có bằng chứng để kiểm thử tự động |
| Ẩn tab chỉ dừng/bật lại timer nhạc | `audio.js:238-241` | SFX vẫn có thể phát khi tab ẩn; context không được treo |

Các nhóm gọi cũ: đặt quân (`main.js:2505,2523,2868`), kết quả local/online
(`2566-2582`, `3638-3656`), đi lại (`2281`, `3550`), từ chối đi lại (`3556`),
vào phòng (`628`, `2325`, `2353`, `2815`, `3603`, `3617`, `3731`),
lỗi (`1079`, `1109`, `2251`, `2458-2500`, `2727`, `3102-3187`, `3416`),
giao diện (`1689`, `1871`, `4367`, `4375`), biểu cảm (`3666`, `3685`).

Rủi ro chính khi nâng cấp: âm thanh là kênh phụ nên không được làm hỏng luồng game;
phải giữ nguyên sự kiện Socket.IO, `localStorage` cũ, chế độ offline và chế độ giảm
chuyển động. Vì vậy logic quyết định âm thanh được tách sang module thuần để test Node,
còn engine/sfx/music chỉ lo phát.

### Thay đổi

| File | Vai trò |
| --- | --- |
| `public/js/audio-logic.js` | Thuần: mặc định âm lượng, làm tròn/kẹp, đường cong, migrate khóa cũ, scene theo màn hình, góc nhìn kết quả, `buildBar` 8 ô nhịp, khóa hiệu ứng kết quả |
| `public/js/audio-engine.js` | Một `AudioContext` lười, master → compressor → đích, bus SFX/nhạc, convolver dùng chung, giới hạn 16 voice có ưu tiên, `stats()`, suspend/resume |
| `public/js/sfx.js` | Tiếng mèo cam/xám khác nhau, biến thiên có seed, quân mình rõ hơn quân đối thủ và pan nhẹ, đúng một tiếng mỗi nước |
| `public/js/music.js` | Nhịp 92 BPM, 4/4, pentatonic, vòng I–vi–IV–V 8 ô nhịp, scheduler 25 ms/nhìn trước 120 ms, fade menu↔ván, duck trước kết quả |
| `public/js/audio.js` | Facade duy nhất cho phần còn lại; `place`, `result`, `setScene`, âm lượng, nghe thử, log kiểm thử khi `window.__MMC_TEST__` |
| `public/js/main.js` | Gọi `place`/`result`, khóa hiệu ứng một lần mỗi ván, góc nhìn online/AI/local/replay, không phát lại sau F5 |
| `public/js/ui.js`, `public/css/style.css`, `public/assets/cats.js` | Hiệu ứng thắng (glow), thua (mưa, bàn xám), hòa (Zzz), tôn trọng `prefers-reduced-motion` |
| `public/js/storage.js`, `public/index.html`, `public/js/i18n.js` | Ba thanh âm lượng 80/40/80, migrate khóa cũ, nhãn VI/EN, `aria-valuetext`, nút nghe thử |
| `public/sw.js` | Cache `meo-meo-caro-v14` kèm các module âm thanh, `haptics.js`, `push.js` và xử lý `push`/`notificationclick`/`pushsubscriptionchange` |
| `test/audio.test.mjs` | 26 test Node với engine/timer giả |

Quyết định đáng chú ý:

- Nhạc và tiếng mèo đều tổng hợp, không có mp3/wav; không dùng giai điệu quen thuộc.
- Âm lượng dùng đường cong bình phương và `setTargetAtTime` để đổi ngay, không bị "pop".
- Kết quả online/AI/2 người/replay đều đi qua `resultPerspective`; khóa
  `resultEffectKey` gồm phòng, vòng, số nước, người thắng nên mỗi ván chỉ phát một lần.
- Khóa `localStorage` cũ được đọc qua `normalizeAudioSettings` (nhận cả
  `masterVolume`, `volume`, `musicVolume`, `sfxVolume`), sau đó ghi lại theo khóa mới.
- Tab ẩn thì treo context; hiện lại thì phục hồi mà không phát lại kết quả cũ.

### Lỗi tìm thấy trong quá trình kiểm thử trình duyệt

| Lỗi | Nguyên nhân | Sửa và test |
| --- | --- | --- |
| Nhạc menu không bắt đầu dù đã chạm lần đầu; `music.timer` luôn `false` | Gán `this.setIntervalFn = globalThis.setInterval` rồi gọi như method → Chrome ném `Illegal invocation` | Bọc arrow trong `music.js`; thêm test hồi quy "timer mặc định không phụ thuộc `this`" trong `test/audio.test.mjs` |

### Kiểm chứng

Chạy thật ngày 2026-11-08:

- `npm test`: **152/152 đạt**, không suite nào lỗi — ai 37, wake 8, server 37,
  auth 15, history 8, password-reset 21, audio 26.
- `npm run test:audio`: **26/26 đạt** (logic thuần, engine giả, SFX, nhạc, facade,
  storage).
- Trình duyệt Chrome headless, 2 browser context độc lập, đặt `window.__MMC_TEST__`
  trước khi tải và đọc `__MMC_AUDIO_LOG`: **18/18 kịch bản đạt**:
  - Log rỗng trước tương tác; chạm lần đầu mở khóa và bật nhạc menu.
  - Slider mặc định 80/40/80, `aria-valuetext` đúng; nghe thử 6 mục; mức âm
    lượng áp dụng ngay và còn sau khi tải lại.
  - Tắt/bật âm thanh dừng và phục hồi nhạc/SFX; đặt quân đúng bên; đi lại không
    phát nhầm kết quả.
  - AI thắng/thua: đúng một tiếng, confetti/glow hoặc mưa/bàn xám, chữ đúng.
  - 2 người cùng máy hòa: đúng một tiếng `draw`, có Zzz, không có tiếng thua.
  - Online 2 trình duyệt: mỗi bên nghe đủ số nước, quân mình/đối thủ khác nhau,
    người thắng nghe `win`, người thua nghe `lose`, mỗi hiệu ứng đúng một lần.
  - F5 khi ván đã xong: khôi phục bàn/kết quả nhưng không phát lại âm thanh.
  - Đối thủ mất kết nối quá hạn: người ở lại nghe `win`, chữ "mất kết nối",
    không có confetti; phòng đóng thì tự về trang chủ.
  - Giảm chuyển động: không mưa/confetti/Zzz nhưng vẫn phát `lose`.
  - 360 px và English: không tràn ngang; thiếu Web Audio: không lỗi, UI vẫn chạy.
  - PWA: cache `meo-meo-caro-v13`, chơi offline với máy được; không lỗi console.

Một số lần chạy đầu có lỗi do chính script QA, không phải sản phẩm: chờ cuộn mượt
của thẻ kết quả chưa xong nên tọa độ bấm bị lệch; kịch bản online giả định A luôn
đi trước trong khi server chọn ngẫu nhiên; phòng tự đóng sau khi đối thủ rời nên
`#game-back` đã ẩn; lỗi mạng `ERR_INTERNET_DISCONNECTED` là chủ ý của bài offline.
Script được sửa để chờ cuộn ổn định, đếm số nước thực tế, chấp nhận trạng thái đã
về trang chủ và bỏ qua lỗi mạng khi ngắt mạng. Lỗi sản phẩm duy nhất phát hiện và
đã sửa trong đợt này là `Illegal invocation` của timer nhạc, có test hồi quy.

Sau khi chạy, `data/meo.db` được khôi phục nguyên trạng (122880 byte); không còn
tiến trình Chrome/Node của QA. Toàn bộ script, profile, ảnh chụp và DB tạm nằm
ngoài repo và đã được xoá.

### Giới hạn

- Chất lượng âm thanh là chiptune tổng hợp, không phải nhạc thu; mục tiêu là nhẹ
  và không tài sản bên thứ ba.
- iOS vẫn cần một lần chạm để mở khóa; công tắc im lặng của iPhone có thể chặn
  toàn bộ Web Audio dù đã bật trong game.
- Trình duyệt không hỗ trợ Web Audio thì im lặng hoàn toàn; mọi thông tin vẫn có
  ở chữ, màu và `aria-live`.
- Phòng online nằm trong RAM; âm thanh không thay đổi giới hạn này.


### Bổ sung: rung khi đến lượt

- `public/js/haptics.js`: `vibrationSupported()` và `vibrateTurn({ enabled, visible, nav })`;
  pattern 35 ms, gọi `navigator.vibrate` đúng ngữ cảnh, nuốt lỗi và trả `false` nếu
  máy không hỗ trợ. Cờ `visible` bỏ qua khi tab ẩn.
- `main.js` gọi cùng chỗ với âm `turn` (khi `room:state` chuyển lượt sang bạn),
  nên mỗi lượt chỉ rung một lần, không rung khi tự đánh hoặc khi F5 khôi phục.
- Cài đặt có công tắc **Rung khi đến lượt**, mặc định bật, lưu cùng `localStorage`;
  bật/tắt phát rung thử ngay.
- Kiểm chứng: `npm run test:haptics` **5/5**; browser QA headless **5/5** — stub
  `navigator.vibrate` trong 2 context online, xác nhận đúng 35 ms khi nhận lượt,
  không rung khi tự đánh/tắt công tắc, công tắc giữ sau tải lại, và cache v13 có
  `haptics.js`. Tổng `npm test` lúc này **157/157**.

## Rà soát trước giai đoạn mới (thông báo đẩy) — 2026-11-18

Phần này **chỉ đọc và chạy thử**: không sửa mã sản phẩm. Mọi thay đổi mã bắt đầu
từ Phần B. Bản sao lưu trước khi làm: tag git `backup-before-push` tại commit
`034ac41` (đã gồm toàn bộ âm thanh và rung 35 ms).

### Kết quả chạy thật

- `npm install` sạch; `npm audit` báo **1 lỗ hổng mức high** trong `nodemailer`
  6.10.1 (nhóm advisory GHSA về SMTP/addressparser). Bản sửa đề xuất là
  `nodemailer@10.6.0` — **nâng major**, nên đợt này chỉ ghi nhận, không tự nâng.
- `npm test`: **157/157 đạt**, không suite nào lỗi — ai 37, wake 8, server 37,
  auth 15, history 8, password-reset 21, audio 26, haptics 5.
- Server chạy với SQLite tạm: `GET /health` → `{"status":"ok"}`;
  `GET /api/config` → `{"ok":true,"mailEnabled":false}`.
- `NODE_ENV=production` không có `SESSION_SECRET`: server **từ chối khởi động**
  (exit 1), đúng như thiết kế (`server.js:50-59`).
- **PostgreSQL chưa được kiểm chứng**: môi trường không có `TEST_DATABASE_URL`,
  `DATABASE_URL`, `psql` hay `pg_isready`. Đây là rủi ro lớn nhất trước khi triển
  khai, nhất là khi thêm bảng `push_subscriptions` ở Phần C.
- Chrome headless, **2 browser context độc lập** (thêm context cho mobile/PWA),
  viewport desktop 1280×900 và mobile 360×740: **38/38 kịch bản đạt**:
  - Trang chủ, tiêu đề, mở Cài đặt, đổi VI/EN, công tắc rung giữ sau tải lại.
  - AI 3×3 Dễ chạy hết ván; bàn ∞ nhận chạm, số nước tăng.
  - 2 người cùng máy chạy hết ván.
  - 360 px: trang chủ, màn chuẩn bị, bàn cờ không tràn ngang; nút chế độ cao
    >44 px; hộp Cài đặt nằm gọn trong viewport.
  - Đăng ký 2 tài khoản; tạo phòng mã 5 ký tự; vào bằng mã; cả hai vào bàn.
  - Rung: đúng **một** xung 35 ms ở bên đang chờ, bên vừa đánh **không** rung.
  - Emote đến đối thủ; xin đi lại + đồng ý hoạt động.
  - Ván online kết thúc, lưu lịch sử; đấu lại; F5 vào lại phòng; đối thủ đóng
    tab được báo mất kết nối.
  - Lịch sử có ván, mở replay, thống kê có bảng.
  - Service worker active, cache `meo-meo-caro-v13` có `js/haptics.js`; chặn
    mạng rồi tải lại vẫn chơi AI được.
  - Không lỗi console ở cả 5 trang (bỏ qua đúng lỗi mạng chủ ý khi test offline).
- Kiểm tra bổ sung: **8/8 đạt** — link mời `/?room=CODE` mở hộp thoại cho người
  đã đăng nhập và vào bàn; đăng ký → đăng xuất → đăng nhập lại; đổi tên hồ sơ.
- Script QA lần đầu có lỗi do chính script (điều kiện `dialog.open` bị đảo, gọi
  `fill` lên `<select>`, chờ disconnect 26 giây chưa đủ, tài khoản thứ 5 bị rate
  limit đăng ký 5/giờ/IP). Đã sửa script và chạy lại trên server/DB mới; không
  phải lỗi sản phẩm.

### Đối chiếu tài liệu với mã

| Hạng mục | Kết quả |
| --- | --- |
| Phiên bản cache trong README/FEATURES/STATUS | Khớp `public/sw.js:5` → `meo-meo-caro-v13`; 28 mục precache đều tồn tại |
| Số test trong tài liệu | Khớp `npm test` → **157/157** |
| Bảng sự kiện Socket.IO | Khớp `socket.on(`/`emit(`; không thiếu sự kiện đang chạy |
| Bảng API HTTP | Khớp 16 route `/api` + `/health` |
| Khóa dịch | `vi` 379 = `en` 379, không thiếu khóa; **11 khóa chết** (bên dưới) |
| Hướng dẫn trong app | Có luật, đi lại, âm thanh/nhạc; **chưa nhắc rung** và chưa có thông báo đẩy |
| File mồ côi / import chết | Không phát hiện; mọi import và asset đều tồn tại |
| `TODO`/`FIXME` | Không có |
| `console.log` | Chỉ log có chủ đích ở `server.js:185` và `mailer.js:131` |
| `.gitignore` | Có `node_modules`, `.env`, `.env.*` (giữ `.env.example`), `data/` |
| Quét bí mật | Chỉ thấy placeholder rỗng trong `.env.example` và ví dụ trong README; không có `.env` được track |
| Hành vi rung | Đúng điều kiện: online, `room:state` chuyển lượt do đối thủ, tab hiện, công tắc bật; test 5/5 + browser xác nhận; không rung khi tự đánh/F5/đấu lại |

### Lỗi và rủi ro theo mức

| Mức | Vấn đề | Vị trí | Cách xử lý đề xuất |
| --- | --- | --- | --- |
| **Cao** | PostgreSQL chưa được kiểm chứng; migration mới cho push có thể lệch SQLite/PostgreSQL | Không có DB trong môi trường; `db.js` | Chạy lại toàn bộ test và migration trên Neon/PostgreSQL trước khi deploy Phần C |
| **Cao** | `nodemailer@6.10.1` có advisory mức high | `package.json` | Không tự nâng major trong đợt này; lên kế hoạch nâng 10.6.0 và chạy lại 21 test password-reset |
| **Trung bình** | iPhone/iPad không thể rung khi đến lượt; tính năng hiện chỉ chạy Android Chrome | `public/js/main.js:2865`, `public/js/haptics.js` | Đúng giới hạn nền tảng; Phần C bổ sung Web Push và ghi rõ iPad không có động cơ rung |
| **Trung bình** | 11 khóa i18n không được tham chiếu | `public/js/i18n.js` | Xóa hoặc nối vào UI ở Phần D: `greeting`, `hardLargeNote`, `turnLabel`, `recordLocal`, `winsAria`, `resetConfirm`, `resetDone`, `opponentOfflineError`, `cellTakenA`, `cellTakenB`, `cellTakenAria` |
| **Thấp** | Thiếu meta Apple và `apple-touch-icon` 180×180 đúng chuẩn | `public/index.html:5-16` (đang trỏ icon 192) | Phần B thêm meta + icon 180 tạo từ SVG gốc |
| **Thấp** | Manifest chỉ có một icon 512 khai báo `"any maskable"` | `public/manifest.json:25-29` | Phần B tách icon `any` và `maskable` riêng |
| **Thấp** | Vùng an toàn mới dùng ở đáy một chỗ, chưa cho header/hộp thoại | `public/css/style.css:2080` | Phần B thêm `env(safe-area-inset-*)` cho thanh trên và modal |
| **Thấp** | `.env.example` chưa có biến VAPID/push | `.env.example` | Phần C thêm |
| **Thấp** | `/api/config` chưa trả `pushEnabled`/`vapidPublicKey` | `auth.js:444` | Phần C thêm |
| **Thông tin** | Link mời yêu cầu đăng nhập trước khi hiện hộp thoại; khách vẫn vào được bằng mã | `public/js/main.js:4686-4700` | Đúng tài liệu; ghi vào checklist thủ công |

### Sẵn sàng cho giai đoạn mới?

**Chưa sẵn sàng để triển khai ngay**, nhưng **đủ sẵn sàng để bắt đầu Phần B/C** trên
SQLite. Điều chặn duy nhất trước khi phát hành là **PostgreSQL chưa được kiểm
chứng** — phải chạy lại test + migration trên một PostgreSQL thật (Neon/Render)
trước khi deploy. Rủi ro thứ hai là `nodemailer` lỗi thời; không chặn tính năng
push nhưng nên nâng có kế hoạch. Các lỗi còn lại đều nhỏ và đã có chỗ sửa (Phase
B: PWA/mobile; Phase C: cấu hình push; Phase D: khóa i18n chết và tài liệu).
Không có lỗi chức năng nào trong ma trận tính năng: mọi tính năng hiện có đều
hoạt động trên SQLite và trong Chrome headless.

## Nâng cấp nhắc “đến lượt bạn” + Web Push — 2026-11-18

Các mục phía trên là **ảnh chụp lịch sử** của từng đợt (số test, cache v13, 28
mục precache đúng ở thời điểm đó). Mục này là trạng thái sau khi hoàn tất Phần
B–D; khi có khác biệt, mục này là bản đúng.

### Phạm vi đã làm

- **Phần B — trải nghiệm điện thoại:** `viewport-fit=cover`, `env(safe-area-inset-*)`
  cả bốn phía, đơn vị `dvh/svh`, `interactive-widget=resizes-content`, đệm cho ô
  nhập và hộp thoại, mục tiêu chạm ≥ 44 px, bố cục xoay ngang, icon maskable và
  meta Apple + `apple-touch-icon` 180×180. Không dùng Wake Lock.
- **Phần C — bốn lớp nhắc lượt, không lặp:** (1) tab hiện → tiếng `turn` sẵn có
  và rung 35 ms trên Android; (2) tab ẩn nhưng còn sống → tiêu đề nhấp nháy
  “● Đến lượt bạn” và huy hiệu ứng dụng; (3) nền/đóng/khoá máy → Web Push mở
  đúng phòng; (4) iOS Safari 17.4+ → công tắc ẩn chỉ để thử rung trong thao tác
  chạm, không dùng để kết luận push mạng sẽ rung.

### Tệp chính

| Tệp | Nội dung |
| --- | --- |
| `push.js` | Hàng đợi gửi, allowlist endpoint chống SSRF, VAPID, TTL 120 giây, urgency high, timeout 5 giây, chống gửi trùng 20 giây, dọn đăng ký hỏng |
| `security.js` | Kiểm tra CSRF/Origin dùng chung cho các route JSON |
| `db.js` | Migration `003_push_subscriptions` + hai index `device_id`, `user_id` |
| `server.js` | Sự kiện `presence:set`, nhận `deviceId` khi tạo/vào/vào lại phòng, điều kiện gửi lượt, gửi khi có người vào phòng đang chờ |
| `auth.js` | `/api/config` trả `pushEnabled`/`vapidPublicKey`; API subscribe/unsubscribe/test; gỡ đăng ký khi xoá tài khoản, bỏ liên kết khi đăng xuất |
| `public/js/push.js` | Dò môi trường iOS/standalone/HTTPS, phân loại trạng thái, đăng ký/huỷ, đếm nhấp nháy tiêu đề, gửi `presence:set` |
| `public/js/haptics.js` | Rung lượt 35 ms và đường thử `switch` iOS chỉ trong thao tác chạm |
| `public/sw.js` | Cache `meo-meo-caro-v14` (29 mục); xử lý `push`, `notificationclick`, `pushsubscriptionchange`, giữ meta thiết bị để tự đăng ký lại |
| `public/js/main.js` | Nối push vào vòng đời ván, chỉ nhắc khi đúng lượt và tab ẩn, mở phòng từ thông báo |
| `public/index.html`, `public/css/style.css`, `public/js/i18n.js` | Thẻ thông báo trong Cài đặt, trạng thái rõ ràng, chuỗi VI/EN (415 khóa mỗi ngôn ngữ), phong cách di động |
| `scripts/vapid-generate.js` | `npm run vapid:generate` tạo cặp khóa, không ghi ra repo |
| `test/push.test.mjs`, `test/push-client.test.mjs`, `test/sw.test.mjs` | 18 + 16 + 17 test cho máy chủ, client và service worker |
| `docs/FEATURES.md`, `README.md`, `docs/REGRESSION_CHECKLIST.md` | Mô tả bốn lớp, giới hạn nền tảng, cách bật, kịch bản kiểm thử máy thật |

Bản sao lưu trước khi sửa vẫn là tag git `backup-before-push` tại commit
`034ac41`.

### Kiểm chứng tự động

- `npm test`: **208/208 đạt**, exit 0 — ai 37, wake 8, server 37, auth 15,
  history 8, password-reset 21, audio 26, haptics 5, push-client 16, sw 17,
  push 18.
- Test push chạy hai lần trên server/DB mới đều đạt, gồm: presence ẩn/hiện,
  không gửi cho người vừa đi, không gửi khi có undo chờ, giới hạn 20 giây,
  endpoint http/IP nội bộ/host lạ bị từ chối, khóa sai kích thước bị từ chối,
  thiếu VAPID thì `pushEnabled:false`, xoá tài khoản gỡ đăng ký.
- Test service worker chạy trong `node:vm` với Cache/Response giả: 29 mục
  precache, định tuyến fetch và fallback offline, nội dung thông báo mặc định và
  cắt ngắn, `notificationclick` focus/postMessage/mở cửa sổ, `pushsubscriptionchange`
  đủ nhánh.

### Kiểm chứng trình duyệt (Chrome headless)

- QA push: **11/11 đạt** — cấp quyền thông báo, service worker v14 kiểm soát
  trang với 29 mục app shell, bật đăng ký, trạng thái chuyển đúng, tắt trả về
  “sẵn sàng”, nút gửi thử hiện toast, `ServiceWorker.deliverPushMessage` hiện
  đúng tiêu đề/tag `turn-…`/`./?room=CODE`, tiêu đề nhấp nháy rồi khôi phục,
  console sạch.
- QA mobile + tiếng Anh: **2/2 đạt** — 360×740 không tràn ngang, thẻ push rộng
  296 px, nút cao 46 px, hộp thoại không tràn; chuỗi tiếng Anh đúng, không lẫn
  dấu tiếng Việt.
- Các đợt trước vẫn giữ nguyên bằng chứng: 38/38 + 8/8 kịch bản online/PWA/mobile.

### Lỗi phát hiện và đã sửa

- Không phát hiện lỗi sản phẩm mới trong QA push. Các lỗi gặp phải đều thuộc
  script/test: kỳ vọng mã đăng ký 200 thay vì 201; giả định người chơi A luôn đi
  trước trong khi server chọn ngẫu nhiên; đọc cache hai lần làm cạn body; test
  service worker so sánh object khác realm; đường dẫn riêng bị tiền tố `/app/`.
  Tất cả đã sửa và chạy lại đạt.
- 11 khóa i18n chết từ báo cáo trước đã được xoá; hiện `vi` và `en` đều 415 khóa,
  không thiếu, không thừa.

### Chưa kiểm chứng trên máy thật

- Rung khi nhận lượt trên Android thật; thông báo hệ thống khi khoá màn hình,
  khi vuốt app khỏi đa nhiệm, khi bật Không làm phiền/công tắc im lặng.
- Cài PWA và nhận push trên iPhone (iOS 16.4+) và iPad; iPad **không có động cơ
  rung** nên chỉ có banner/âm thanh.
- Gửi push thật qua FCM/Apple/Mozilla/WNS bằng khóa VAPID thật; đợt này chỉ dùng
  `PUSH_PROVIDER=test`.
- Vùng an toàn tai thỏ/Home, bàn phím ảo và xoay ngang trên thiết bị thật.
- **PostgreSQL vẫn chưa được kiểm chứng** (không có DB trong môi trường). Phải
  chạy migration `003_push_subscriptions` và toàn bộ test trên Neon/Render trước
  khi phát hành.

### Rủi ro còn lại

- `npm audit` vẫn báo **1 lỗ hổng high** ở `nodemailer@6.10.1`; bản sửa là
  `10.6.0` (nâng major), chưa tự nâng trong đợt này.
- Push thật phụ thuộc dịch vụ ngoài; endpoint hỏng được dọn theo 404/410,
  `fail_count > 5` hoặc 60 ngày không thành công.
- iPhone Safari dạng tab không nhận push; chỉ PWA từ Màn hình chính. Không có
  cách nào để trang web tự bật rung trên iOS.
