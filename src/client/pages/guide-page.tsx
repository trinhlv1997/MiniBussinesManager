import type { ReactNode } from "react";
import { Link } from "react-router";
import { Lightbulb, TriangleAlert } from "lucide-react";
import { AUDIT_RETENTION_DAYS } from "@shared/audit";
import { canAccess, type Module, type Role } from "@shared/permissions";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useSession } from "@/features/auth/use-auth";

/**
 * Hướng dẫn sử dụng. Mỗi mục gắn với một chức năng (module) và chỉ hiện với vai trò được dùng
 * chức năng đó, để Nhân viên không đọc hướng dẫn cho màn hình họ không mở được.
 */
type Section = { id: string; title: string; module?: Module; body: ReactNode };

const Steps = ({ children }: { children: ReactNode }) => (
  <ol className="ml-5 list-decimal space-y-1.5 marker:font-medium marker:text-muted-foreground">{children}</ol>
);
const Bullets = ({ children }: { children: ReactNode }) => (
  <ul className="ml-5 list-disc space-y-1.5 marker:text-muted-foreground">{children}</ul>
);
const H3 = ({ children }: { children: ReactNode }) => <h3 className="pt-2 font-semibold">{children}</h3>;
const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>;

function Note({ tone = "tip", children }: { tone?: "tip" | "warn"; children: ReactNode }) {
  const Icon = tone === "tip" ? Lightbulb : TriangleAlert;
  return (
    <div
      className={
        tone === "tip"
          ? "flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3"
          : "flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
      }
    >
      <Icon aria-hidden className={tone === "tip" ? "mt-0.5 size-4 shrink-0 text-primary" : "mt-0.5 size-4 shrink-0 text-amber-600"} />
      <div>{children}</div>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t align-top">
              {cells.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "bat-dau",
    title: "Bắt đầu sử dụng",
    body: (
      <>
        <H3>Đăng nhập và đăng xuất</H3>
        <Steps>
          <li>Mở trang hệ thống, nhập <B>Tên đăng nhập</B> và <B>Mật khẩu</B> do quản trị viên cấp, bấm <B>Đăng nhập</B>.</li>
          <li>Đăng nhập sai nhiều lần liên tiếp sẽ bị tạm khoá một lúc. Hãy chờ rồi thử lại, hoặc nhờ quản trị viên đặt lại mật khẩu.</li>
          <li>Muốn thoát: bấm vào <B>ảnh đại diện</B> ở góc phải trên cùng → <B>Đăng xuất</B>.</li>
        </Steps>
        <H3>Giao diện chung</H3>
        <Bullets>
          <li><B>Menu bên trái</B> chỉ hiện các chức năng bạn được phép dùng. Nút ở góc trái thanh trên cùng thu gọn / mở rộng menu (trên điện thoại, nút này mở menu).</li>
          <li><B>Biểu tượng mặt trăng</B> ở góc phải chuyển giữa giao diện sáng và tối.</li>
          <li>Các danh sách đều có ô <B>tìm kiếm</B>, bộ lọc, sắp xếp bằng cách bấm vào tiêu đề cột và phân trang ở cuối bảng. Bấm vào một dòng để xem chi tiết.</li>
          <li>Hầu hết danh sách có nút <B>Xuất Excel</B>: tải file .xlsx theo đúng bộ lọc đang chọn (tối đa 2.000 dòng).</li>
        </Bullets>
        <H3>Đổi mật khẩu</H3>
        <Steps>
          <li>Bấm ảnh đại diện ở góc phải → <B>Tài khoản của tôi</B>.</li>
          <li>Nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 12 ký tự), rồi lưu. Sau khi đổi, bạn đăng nhập lại bằng mật khẩu mới.</li>
        </Steps>
        <Note>Lần đầu đăng nhập bằng mật khẩu được cấp, hãy đổi ngay sang mật khẩu của riêng bạn.</Note>
      </>
    ),
  },
  {
    id: "vai-tro",
    title: "Vai trò và quyền hạn",
    body: (
      <>
        <p>Mỗi tài khoản có một vai trò. Vai trò quyết định bạn thấy những menu nào và được làm gì.</p>
        <SimpleTable
          head={["Vai trò", "Được dùng"]}
          rows={[
            [<B key="a">Quản trị (toàn quyền)</B>, "Toàn bộ hệ thống: Tổng quan, Nhân viên, Khách hàng, Sản phẩm, Quản lý kho, Báo cáo, Người dùng, Nhật ký hoạt động, Cài đặt."],
            [
              <B key="e">Nhân viên</B>,
              "Khách hàng, Sản phẩm, Quản lý kho. Chỉ thấy khách hàng mình được phân công chăm sóc hoặc do mình tạo; không đặt được hạng VIP; phiếu xuất chỉ giao cho khách trong phạm vi của mình.",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "tong-quan",
    title: "Tổng quan",
    module: "dashboard",
    body: (
      <>
        <p>Trang đầu tiên sau khi đăng nhập, cho thấy nhanh tình hình kinh doanh.</p>
        <Bullets>
          <li>Chọn khoảng thời gian ở góc phải: <B>7 / 30 / 90 ngày gần nhất</B> hoặc <B>Tùy chọn khoảng ngày</B>. Các con số "trong khoảng đã chọn" và biểu đồ thay đổi theo.</li>
          <li><B>Doanh thu</B> và <B>Lợi nhuận gộp</B> tính từ các phiếu xuất kho cho khách hàng đã xác nhận. Lợi nhuận gộp = doanh thu trừ giá vốn.</li>
          <li><B>Giá trị tồn kho</B> tính theo giá nhập hiện tại của từng sản phẩm.</li>
          <li>Thẻ <B>Sắp hết hàng</B> / <B>Hết hàng</B> và các danh sách bên dưới bấm vào được để đi thẳng tới màn hình liên quan.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "nhan-vien",
    title: "Nhân viên",
    module: "employees",
    body: (
      <>
        <H3>Thêm nhân viên</H3>
        <Steps>
          <li>Vào <B>Nhân viên</B> → bấm <B>Thêm nhân viên</B>.</li>
          <li>Nhập họ tên, chức vụ, số điện thoại, email, ngày vào làm, lương cơ bản và trạng thái.</li>
          <li><B>Mã nhân viên</B> có thể để trống, hệ thống tự sinh dạng NV0001, NV0002…</li>
        </Steps>
        <H3>Theo dõi và cập nhật</H3>
        <Bullets>
          <li>Trạng thái: <B>Đang làm việc</B>, <B>Tạm nghỉ</B>, <B>Đã nghỉ việc</B>. Lọc danh sách theo trạng thái để xem nhanh.</li>
          <li>Cửa sổ chi tiết có mục <B>Khách hàng phụ trách</B>: các khách nhân viên này đang chăm sóc.</li>
          <li>Nhân viên muốn đăng nhập hệ thống cần có tài khoản riêng, tạo ở mục <B>Người dùng</B>.</li>
        </Bullets>
        <Note tone="warn">Xoá một nhân viên thì các khách hàng họ phụ trách trở về "Chưa phân công". Nếu nhân viên chỉ nghỉ việc, nên đổi trạng thái thay vì xoá.</Note>
      </>
    ),
  },
  {
    id: "khach-hang",
    title: "Khách hàng",
    module: "customers",
    body: (
      <>
        <H3>Thêm khách hàng</H3>
        <Steps>
          <li>Vào <B>Khách hàng</B> → <B>Thêm khách hàng</B>.</li>
          <li>Chọn loại <B>Cá nhân</B> hoặc <B>Doanh nghiệp</B> (doanh nghiệp nên nhập mã số thuế), nhập tên, điện thoại, email, địa chỉ.</li>
          <li>Chọn <B>Hạng khách hàng</B> và <B>Nhân viên chăm sóc</B> (không bắt buộc). Mã khách hàng để trống sẽ tự sinh dạng KH0001…</li>
        </Steps>
        <H3>Hạng khách hàng và giá bán</H3>
        <SimpleTable
          head={["Hạng", "Dành cho", "Giá tự điền khi xuất kho"]}
          rows={[
            [<B key="v">VIP</B>, "Nhà phân phối", "Giá phân phối"],
            [<B key="n">Bình thường</B>, "Đại lý (mặc định cho khách mới)", "Giá đại lý"],
            [<B key="b">Cơ bản</B>, "Khách lẻ", "Giá khách lẻ"],
          ]}
        />
        <H3>Ghi chú và chăm sóc</H3>
        <Bullets>
          <li>Trong cửa sổ chi tiết khách hàng có thể thêm <B>ghi chú</B> (lần gọi điện, yêu cầu, hẹn giao…) để cả nhóm cùng theo dõi.</li>
          <li>Lọc danh sách theo nhân viên chăm sóc, hoặc sắp xếp cột Hạng để đưa nhà phân phối lên đầu.</li>
          <li>Nhân viên tạo khách mới thì khách tự được giao cho chính họ; chỉ quản trị viên phân công lại được.</li>
        </Bullets>
        <Note>Chỉ quản trị viên được thêm khách VIP, nâng khách lên VIP hoặc đổi hạng của khách VIP.</Note>
      </>
    ),
  },
  {
    id: "san-pham",
    title: "Sản phẩm",
    module: "products",
    body: (
      <>
        <H3>Danh mục</H3>
        <p>Nhóm sản phẩm theo danh mục (ví dụ: Thiết bị điện tử, Điện gia dụng) để lọc và xem báo cáo. Quản lý danh mục ngay trên màn hình <B>Sản phẩm</B>.</p>
        <H3>Thêm sản phẩm</H3>
        <Steps>
          <li>Vào <B>Sản phẩm</B> → <B>Thêm sản phẩm</B>.</li>
          <li>Nhập mã SKU, tên, danh mục, thương hiệu, đơn vị tính (Cái, Chiếc, Bộ, Mét…), thời gian bảo hành.</li>
          <li>Nhập <B>giá nhập</B> và ba mức giá bán: <B>Giá phân phối</B>, <B>Giá đại lý</B>, <B>Giá khách lẻ</B>. Để trống giá phân phối / đại lý nghĩa là bằng giá lẻ.</li>
          <li>Đặt <B>Số lượng tồn tối thiểu</B>: khi tồn kho xuống bằng hoặc thấp hơn mức này, sản phẩm được báo "Sắp hết hàng".</li>
        </Steps>
        <Note>Số lượng tồn không sửa trực tiếp trên sản phẩm. Tồn kho chỉ thay đổi qua phiếu nhập, xuất hoặc điều chỉnh ở mục <B>Quản lý kho</B>.</Note>
        <p>Sản phẩm không bán nữa: đổi trạng thái sang <B>Ngừng kinh doanh</B> để giữ lại lịch sử thay vì xoá.</p>
      </>
    ),
  },
  {
    id: "kho",
    title: "Quản lý kho",
    module: "inventory",
    body: (
      <>
        <p>Màn hình <B>Quản lý kho</B> có 3 thẻ: <B>Tồn kho</B> (số lượng và giá trị tồn từng sản phẩm), <B>Lịch sử giao dịch</B> (tất cả phiếu) và <B>Cảnh báo</B> (sản phẩm sắp hết / hết hàng).</p>
        <H3>Nhập kho (hàng về)</H3>
        <Steps>
          <li>Bấm <B>Nhập kho</B> ở góc phải.</li>
          <li>Chọn ngày, ghi <B>Tham chiếu</B> nếu có (số hoá đơn, số phiếu của nhà cung cấp…).</li>
          <li>Thêm từng dòng sản phẩm: chọn sản phẩm, nhập số lượng và đơn giá nhập.</li>
          <li>Bấm <B>Lưu và xác nhận</B> để cộng vào tồn kho ngay, hoặc <B>Lưu nháp</B> nếu chưa chắc chắn.</li>
        </Steps>
        <H3>Xuất kho (bán hàng / giao hàng)</H3>
        <Steps>
          <li>Bấm <B>Xuất kho</B>, chọn <B>Người nhận</B>: một khách hàng hoặc một nhân viên (ví dụ xuất hàng mẫu, hàng dùng nội bộ).</li>
          <li>Thêm sản phẩm và số lượng. <B>Đơn giá tự điền theo hạng của khách</B> (VIP → giá phân phối, Bình thường → giá đại lý, Cơ bản → giá lẻ; xuất cho nhân viên dùng giá lẻ).</li>
          <li>Có thể gõ giá khác cho một dòng. Muốn quay về giá theo hạng, xoá trống ô đơn giá.</li>
          <li><B>Lưu và xác nhận</B> để trừ tồn kho. Không đủ hàng thì hệ thống báo lỗi và không trừ gì cả.</li>
        </Steps>
        <H3>Điều chỉnh (kiểm kê, hàng hỏng, thất lạc)</H3>
        <Steps>
          <li>Bấm <B>Điều chỉnh</B>, nhập <B>Lý do điều chỉnh</B> (bắt buộc).</li>
          <li>Với từng sản phẩm, nhập số lượng chênh lệch: <B>số dương</B> để cộng thêm, <B>số âm</B> để trừ bớt. Ví dụ kiểm kê thiếu 2 cái thì nhập -2.</li>
        </Steps>
        <H3>Phiếu nháp, xác nhận, huỷ và đảo ngược</H3>
        <SimpleTable
          head={["Trạng thái", "Ý nghĩa", "Làm được gì"]}
          rows={[
            [<B key="d">Nháp</B>, "Chưa ảnh hưởng tồn kho.", "Sửa lại, Xác nhận, hoặc Huỷ phiếu."],
            [<B key="c">Đã xác nhận</B>, "Đã cộng / trừ tồn kho. Không sửa được nữa.", "Đảo ngược phiếu nếu lập sai."],
            [<B key="x">Đã huỷ</B>, "Phiếu nháp bị bỏ, không bao giờ ảnh hưởng tồn kho.", "Chỉ xem."],
          ]}
        />
        <p className="pt-1">
          <B>Đảo ngược phiếu</B>: mở phiếu đã xác nhận → <B>Đảo ngược phiếu</B> → nhập lý do. Hệ thống tạo một phiếu đảo ngược trả tồn kho về như trước, phiếu gốc vẫn được giữ để đối chiếu. Sau đó lập lại phiếu đúng.
        </p>
        <H3>In phiếu xuất kho (PDF)</H3>
        <Bullets>
          <li>Mở một phiếu xuất kho <B>đã xác nhận, giao cho khách hàng</B> → bấm <B>In phiếu xuất kho (PDF)</B>.</li>
          <li>File PDF khổ A4 theo mẫu chứng từ, lấy tên, địa chỉ, MST và logo công ty từ mục <B>Cài đặt</B>, có số tiền viết bằng chữ và chỗ ký.</li>
          <li>Phiếu xuất cho nhân viên và phiếu đã đảo ngược không in được vì không phải doanh thu.</li>
        </Bullets>
        <Note tone="warn">Phiếu xuất kho PDF là chứng từ nội bộ, không thay thế hoá đơn điện tử (GTGT).</Note>
      </>
    ),
  },
  {
    id: "bao-cao",
    title: "Báo cáo",
    module: "reports",
    body: (
      <>
        <p>Có 4 thẻ báo cáo: <B>Kho</B>, <B>Sản phẩm</B>, <B>Khách hàng</B>, <B>Nhân viên</B>.</p>
        <Steps>
          <li>Chọn thẻ cần xem và khoảng thời gian (7 / 30 / 90 ngày hoặc tự chọn).</li>
          <li>Xem các con số tổng hợp và biểu đồ: nhập / xuất kho, biến động tồn, giá trị tồn theo danh mục, khách hàng mới, nhân viên vào làm…</li>
          <li>Bấm <B>Xuất Excel</B> để tải dữ liệu chi tiết. Trong file, số tiền và ngày là dữ liệu thật nên cộng, lọc, sắp xếp được ngay.</li>
        </Steps>
      </>
    ),
  },
  {
    id: "nguoi-dung",
    title: "Người dùng (tài khoản đăng nhập)",
    module: "users",
    body: (
      <>
        <Steps>
          <li>Vào <B>Người dùng</B> → <B>Thêm tài khoản</B>: nhập tên đăng nhập, tên hiển thị, mật khẩu ban đầu và chọn <B>Vai trò</B>.</li>
          <li>Với tài khoản Nhân viên, chọn <B>Nhân viên gắn với tài khoản</B> để họ thấy đúng các khách mình phụ trách. Mỗi nhân viên có tối đa một tài khoản.</li>
          <li>Gửi tên đăng nhập và mật khẩu ban đầu cho người dùng, dặn họ đổi mật khẩu sau lần đăng nhập đầu.</li>
        </Steps>
        <Bullets>
          <li><B>Khoá</B> tài khoản khi có người nghỉ việc: bấm sửa tài khoản và tắt trạng thái hoạt động (danh sách sẽ hiện "Đã khoá"). Tài khoản không bị xoá để nhật ký vẫn giữ tên người đã thao tác.</li>
          <li><B>Đặt lại mật khẩu</B> khi người dùng quên. Họ sẽ bị đăng xuất khỏi mọi thiết bị.</li>
          <li>Hệ thống luôn giữ ít nhất một quản trị viên đang hoạt động; bạn không thể tự khoá hay tự hạ quyền chính mình.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "nhat-ky",
    title: "Nhật ký hoạt động",
    module: "audit",
    body: (
      <>
        <p>Ghi lại ai đã làm gì, lúc nào: đăng nhập, thêm / sửa / xoá dữ liệu, lập / xác nhận / huỷ / đảo ngược phiếu kho, đổi mật khẩu, quản lý tài khoản.</p>
        <Bullets>
          <li>Lọc theo người thao tác, loại đối tượng và khoảng ngày; xuất Excel khi cần lưu trữ.</li>
          <li>Trong cửa sổ chi tiết của từng nhân viên, khách hàng, sản phẩm… có mục <B>Lịch sử thay đổi</B> của riêng bản ghi đó.</li>
        </Bullets>
        <Note tone="warn">Nhật ký chỉ giữ {AUDIT_RETENTION_DAYS} ngày gần nhất. Cần lưu lâu hơn thì xuất Excel định kỳ trước khi dữ liệu cũ bị xoá.</Note>
      </>
    ),
  },
  {
    id: "cai-dat",
    title: "Cài đặt",
    module: "settings",
    body: (
      <>
        <p>Nhập thông tin công ty: <B>Tên ứng dụng</B> (hiện ở góc trên menu), <B>Tên công ty</B>, địa chỉ, số điện thoại, mã số thuế và <B>Logo</B>.</p>
        <p>Các thông tin này được in lên phiếu xuất kho PDF, nên hãy điền đầy đủ và chính xác trước khi in phiếu cho khách.</p>
      </>
    ),
  },
  {
    id: "meo",
    title: "Mẹo và câu hỏi thường gặp",
    body: (
      <Bullets>
        <li><B>Tồn kho không thay đổi sau khi lập phiếu?</B> Phiếu đang ở trạng thái Nháp. Mở phiếu và bấm Xác nhận.</li>
        <li><B>Lập sai phiếu đã xác nhận?</B> Dùng Đảo ngược phiếu rồi lập lại phiếu đúng; không cần xoá.</li>
        <li><B>Đơn giá xuất kho không đúng giá mong muốn?</B> Kiểm tra hạng của khách và ba mức giá của sản phẩm.</li>
        <li><B>Không thấy một khách hàng?</B> Tài khoản Nhân viên chỉ thấy khách được phân công cho mình hoặc do mình tạo. Nhờ quản trị viên phân công lại.</li>
        <li><B>Bị đưa về trang đăng nhập?</B> Phiên đăng nhập đã hết hạn hoặc mật khẩu vừa được đặt lại; hãy đăng nhập lại.</li>
        <li><B>Không thấy một menu?</B> Vai trò của bạn không được dùng chức năng đó.</li>
      </Bullets>
    ),
  },
];

const visibleSections = (role: Role | undefined) =>
  SECTIONS.filter((section) => !section.module || canAccess(role, section.module));

export default function GuidePage() {
  const { data: me } = useSession();
  const sections = visibleSections(me?.role);

  return (
    <>
      <PageHeader title="Hướng dẫn sử dụng" description="Cách dùng từng chức năng của hệ thống, theo đúng quyền của tài khoản bạn." />
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Mục lục" className="lg:sticky lg:top-20">
          <Card className="gap-0 p-3">
            <p className="px-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Mục lục</p>
            <ol className="grid gap-0.5 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums">{index + 1}.</span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </Card>
        </nav>
        <div className="grid gap-4">
          {sections.map((section, index) => (
            <Card key={section.id} id={section.id} className="scroll-mt-20 gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {index + 1}. {section.title}
                </h2>
                {section.module && !canAccess("employee", section.module) && <Badge variant="secondary">Chỉ quản trị</Badge>}
              </div>
              <div className="grid gap-2.5 text-sm leading-relaxed text-muted-foreground">{section.body}</div>
            </Card>
          ))}
          <p className="text-center text-sm text-muted-foreground">
            Cần trợ giúp thêm? Liên hệ quản trị viên hệ thống. <Link to="/tai-khoan" className="text-primary hover:underline">Đổi mật khẩu của bạn</Link>
          </p>
        </div>
      </div>
    </>
  );
}
