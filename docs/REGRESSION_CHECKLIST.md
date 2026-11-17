# Checklist kiểm thử thủ công — Meo Meo Caro

Dùng sau mỗi đợt thay đổi lớn. Đánh dấu ✅ / ❌ / ⚠️ và ghi chú thiết bị, phiên
bản hệ điều hành. Các mục ghi **“Máy thật”** không thể kiểm chứng bằng trình duyệt
giả lập; nếu chưa có thiết bị, ghi **“chưa kiểm chứng trên máy thật”**.

Chuẩn bị chung:

- Một tài khoản A và B (hai trình duyệt/thiết bị khác nhau để test online).
- Bản deploy HTTPS công khai (Render hoặc cloudflared). `http://LAN-IP` **không**
  dùng được cho Web Push.
- Bật âm lượng, tắt chế độ im lặng khi test âm thanh.

## 1. Cơ bản trên máy tính

| # | Việc làm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- |
| 1.1 | Mở trang chủ, tải lại | Không lỗi console; giao diện VI mặc định | |
| 1.2 | Đổi sang EN rồi VI | Mọi chữ đổi ngay, không tải lại | |
| 1.3 | Chơi với máy 3×3 cả 3 độ khó, cả hai lượt đi trước | Máy đi hợp lệ, không treo, kết quả đúng | |
| 1.4 | Chơi với máy ∞, kéo/zoom/chạm | Bàn mở rộng, đặt được quân, không tràn | |
| 1.5 | Hai người cùng máy 3×3 và ∞ | Lượt đổi đúng, kết quả đúng | |
| 1.6 | Đi lại với máy (3×3, ∞) | Hoàn tác đúng nước + nước máy đáp, lượt về bạn | |
| 1.7 | Bật/tắt âm thanh, nhạc, kéo 3 thanh âm lượng, nghe thử | Thay đổi ngay, giữ sau tải lại | |
| 1.8 | Bật/tắt “Rung khi đến lượt” trên máy tính | Không lỗi; không có rung (máy tính không hỗ trợ) | |
| 1.9 | Mở Hướng dẫn | Có luật, đi lại, âm thanh/nhạc (và thông báo đẩy sau đợt này) | |
| 1.10 | Bảng điểm: chơi vài ván rồi mở, đặt lại | Điểm đúng theo cỡ bàn, đặt lại có xác nhận | |
| 1.11 | Tài khoản: đăng ký → đăng xuất → đăng nhập → đổi tên/avatar | Thành công, trạng thái đúng | |
| 1.12 | Quên mật khẩu: nhận thư, mở link, đặt mật khẩu mới | Link dùng một lần, hết hạn đúng | |
| 1.13 | Xác thực email: đổi email, nhận thư, bấm link | Email chuyển sang “đã xác thực” | |
| 1.14 | Xoá tài khoản (dùng tài khoản thử) | Đăng xuất, không đăng nhập lại được, lịch sử ẩn danh | |

## 2. Online (hai trình duyệt/thiết bị)

| # | Việc làm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- |
| 2.1 | A tạo phòng, B vào bằng mã | Cả hai vào bàn, đúng cỡ bàn | |
| 2.2 | A tạo phòng, B mở link `/?room=CODE` | B (đã đăng nhập) thấy hộp thoại mời và vào bàn; khách được đưa tới đăng nhập trước | |
| 2.3 | Chơi hết ván | Kết quả đúng, lưu lịch sử cho tài khoản | |
| 2.4 | Đấu lại | Hai bên bỏ phiếu, ván mới, điểm cộng dồn | |
| 2.5 | Emote | Đối thủ thấy bong bóng, có giới hạn tần suất | |
| 2.6 | Xin đi lại → đồng ý | Bàn lùi đúng, lượt về người xin, đồng hồ cấp lại | |
| 2.7 | Xin đi lại → từ chối / hết 15 giây | Bàn không đổi, thông báo đúng loại | |
| 2.8 | Bấm F5 giữa ván | Vào lại đúng bàn, đúng lượt, không phát lại âm thanh | |
| 2.9 | B đóng tab | A thấy báo mất kết nối; sau thời gian chờ xử thua/đóng phòng | |
| 2.10 | A mở tab thứ hai cùng tài khoản | Tab cũ bị thay thế, tab mới vào phòng | |
| 2.11 | Lịch sử → xem lại → thống kê | Đúng ván, phát lại được, số liệu khớp | |

## 3. Điện thoại — bố cục và thao tác (có thể giả lập)

| # | Việc làm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- |
| 3.1 | Mở ở 320, 360, 375, 390 px | Không tràn ngang, chữ đọc được | |
| 3.2 | Xoay ngang điện thoại | Bố cục không vỡ, bàn cờ vẫn thấy đủ | |
| 3.3 | Chạm đúp lên nút/ô cờ | Không zoom trang | |
| 3.4 | Nhấn giữ trên bàn cờ | Không bôi đen chữ, không hiện menu sao chép | |
| 3.5 | Cuộn màn hình dài | Vuốt không kéo-làm-mới giữa ván; vẫn cuộn được | |
| 3.6 | Bàn phím ảo khi nhập mã phòng / mật khẩu | Ô nhập không bị che, bấm được nút gửi | |
| 3.7 | Tai thỏ / Dynamic Island, thanh Home | Nút và hộp thoại không bị che | |
| 3.8 | Hộp thoại đi lại/mã phòng trên màn nhỏ | Bấm được bằng ngón cái, không tràn | |

## 4. PWA và cài đặt (Máy thật)

| # | Việc làm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- |
| 4.1 | **Android Chrome:** menu → “Thêm vào Màn hình chính” | Icon đúng, mở standalone không có thanh địa chỉ | |
| 4.2 | **iPhone Safari:** Chia sẻ → “Thêm vào Màn hình chính” | Icon 180×180 sắc nét, tên “Meo Caro”, mở toàn màn hình | |
| 4.3 | **iPad Safari:** Thêm vào Màn hình chính | Mở standalone, bố cục dọc/ngang đúng | |
| 4.4 | Mở app đã cài, chặn mạng, tải lại | Trang và module tải từ cache; chơi AI được | |
| 4.5 | Deploy bản mới rồi mở lại app cũ | Nhận cache mới (kiểm tra phiên bản trong DevTools/Remote) | |

## 5. Thông báo đẩy “đến lượt bạn” (Máy thật)

Chỉ chạy sau khi đã đặt đủ `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` trên server HTTPS.

| # | Việc làm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- |
| 5.1 | **Android Chrome:** Cài PWA → Cài đặt → Thông báo đẩy → bật | Hộp giải thích hiện trước; đồng ý quyền; trạng thái “Đang bật” | |
| 5.2 | Android: bấm “Gửi thông báo thử”, khóa màn hình | Thông báo hệ thống đến sau vài giây; có rung theo cài đặt | |
| 5.3 | Android: hai người chơi, ẩn app ở phía chờ lượt | Đúng **một** thông báo khi đối thủ đánh; bấm vào mở đúng phòng | |
| 5.4 | iPhone (iOS 16.4+): mở Safari thường, vào Cài đặt | Hiện “Cần thêm vào Màn hình chính” + hướng dẫn từng bước | |
| 5.5 | iPhone: cài PWA, mở từ biểu tượng, bật thông báo | Xin quyền sau thao tác chạm; trạng thái “Đang bật” | |
| 5.6 | iPhone: bấm “Gửi thông báo thử”, khóa màn hình | Banner + âm/rung **do iOS quyết định**; có thể không rung | |
| 5.7 | iPhone: bật công tắc im lặng | Thông báo vẫn có thể hiện banner nhưng **không âm/rung** | |
| 5.8 | iPhone: bật Không làm phiền | Thông báo bị giữ/ẩn theo cài đặt hệ thống | |
| 5.9 | **iPad:** cài PWA, bật thông báo, chờ lượt | Chỉ banner + âm báo; **không rung** (iPad không có động cơ rung) | |
| 5.10 | iPhone/iPad: bấm vào thông báo khi app đã mở | App được focus và mở đúng phòng | |
| 5.11 | iPhone/iPad: bấm thông báo khi app đã đóng | App mở bằng `/?room=CODE`, vào đúng phòng hoặc hộp thoại mời | |
| 5.12 | Máy tính: ẩn tab khi chờ lượt | Tiêu đề nhấp nháy “● Đến lượt bạn” (nếu trình duyệt hỗ trợ huy hiệu thì có số 1) | |
| 5.13 | Quay lại tab / ván kết thúc / rời phòng | Tiêu đề khôi phục, huy hiệu được xoá | |
| 5.14 | Tắt công tắc thông báo đẩy | Không còn thông báo; đăng ký bị gỡ trên thiết bị | |
| 5.15 | Đăng xuất rồi chờ lượt | Không nhận thông báo của tài khoản cũ trên thiết bị đã đăng xuất (theo chính sách đã chọn) | |
| 5.16 | Xoá tài khoản | Đăng ký đẩy của thiết bị hiện tại bị gỡ; không còn thông báo | |
| 5.17 | Chạy server thiếu khóa VAPID | `GET /api/config` trả `pushEnabled:false`; mục thông báo ẩn; server vẫn chạy | |
| 5.18 | Mở bằng `http://` không phải localhost | Giao diện giải thích vì sao không bật được thông báo | |
| 5.19 | **iPhone Safari 17.4+:** bấm “Rung thử” trong Cài đặt | Có thể rung nhẹ; nếu không rung thì ghi nhận, **không coi là lỗi** | |
| 5.20 | iPhone: chờ lượt khi tab ẩn (không có push) | Không có rung đáng tin cậy; chỉ nhắc qua thông báo đẩy | |
| 5.21 | Máy tính/điện thoại: giữ tab **hiện** khi đến lượt | Chỉ có tiếng (và rung trên Android); **không** có banner thông báo hệ thống, tiêu đề không nhấp nháy | |

## 6. Ca chỉ làm được trên máy thật

- [ ] Cài PWA trên Android/iPhone/iPad và mở từ biểu tượng (không phải tab Safari/Chrome).
- [ ] Xin quyền thông báo đúng thao tác chạm; thử từ chối rồi bật lại trong cài đặt hệ thống.
- [ ] Nhận thông báo khi app ở nền, khi khóa màn hình, khi vuốt app khỏi đa nhiệm.
- [ ] Bấm thông báo mở đúng phòng khi app đã mở và khi app đã đóng.
- [ ] Rung/âm báo: Android có rung; iPhone theo cài đặt hệ thống; iPad không rung.
- [ ] Công tắc im lặng và chế độ Không làm phiền trên iPhone/iPad.
- [ ] Mất mạng rồi có mạng lại khi đang chờ lượt; thông báo không đến trùng.
- [ ] Xoay dọc/ngang trên iPhone có tai thỏ và iPad.
- [ ] Kiểm tra pin: không bật Wake Lock, màn hình vẫn tự khóa khi chờ (đúng thiết kế).

## 7. Sau khi test

- [ ] Không còn thông báo trùng cho cùng một lượt.
- [ ] Không có endpoint/khóa VAPID bị lộ trong log, ảnh chụp hay báo cáo.
- [ ] Xoá tài khoản/đăng ký thử; khôi phục DB nếu test trên dữ liệu thật.
