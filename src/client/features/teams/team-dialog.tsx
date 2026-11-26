import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { ROLE_LABELS } from "@shared/permissions";
import { toSearchText } from "@shared/text";
import type { Team, TeamCandidate } from "@shared/types";
import {
  MAX_NEW_MEMBER_ACCOUNTS,
  teamMembersSchema,
  teamSchema,
  type TeamFormValues,
  type TeamInput,
  type TeamMembersInput,
  type TeamMembersValues,
} from "@shared/validation/tasks";
import { FormDialog } from "@/components/common/dialogs";
import { Field, SelectField, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { useSaveForm } from "@/hooks/use-save-form";
import { apiRequest } from "@/lib/api";
import { refreshAfterChange, useSaveResource } from "@/lib/resource";

export const TEAMS = { key: "teams", path: "/teams" };
/** Lưu nhóm có thể tạo tài khoản / nâng quyền, nên tải lại cả danh sách người dùng và người nhận việc. */
const RELATED = ["tasks", "users", "user-names"];

/** Gợi ý tên đăng nhập từ họ tên: "Ngô Phương Linh" → "linh.np" (thêm số nếu đã có người dùng). */
function suggestUsername(name: string, taken: Set<string>) {
  const words = toSearchText(name).replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? "nhanvien";
  const base = words.length > 1 ? `${last}.${words.slice(0, -1).map((word) => word[0]).join("")}` : last;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
}

type Row = { candidate: TeamCandidate; elsewhere: string | null };

/** Một dòng trong danh sách thành viên: ô tick, tên, vai trò / chức vụ, ghi chú nếu không chọn được. */
function MemberRow({
  row,
  checked,
  disabled,
  note,
  onToggle,
  children,
}: {
  row: Row;
  checked: boolean;
  disabled: boolean;
  note?: string;
  onToggle: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  const { candidate } = row;
  const detail = [candidate.role ? ROLE_LABELS[candidate.role] : "Chưa có tài khoản", candidate.position].filter(Boolean).join(" · ");
  return (
    <div className={`rounded-md px-2 py-1.5 ${checked ? "bg-primary/5" : ""}`}>
      <label className={`flex items-center gap-2 text-sm ${disabled ? "text-muted-foreground" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-primary"
          disabled={disabled}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="min-w-0">
          <span className="block truncate">{candidate.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
            {note && ` · ${note}`}
          </span>
        </span>
      </label>
      {children}
    </div>
  );
}

function rowsOf(candidates: TeamCandidate[], teams: Team[], team?: Team): Row[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  return candidates
    .filter((c) => c.userId === null || c.active || team?.memberIds.includes(c.userId))
    .map((candidate) => ({
      candidate,
      elsewhere: candidate.teamId && candidate.teamId !== team?.id ? (teamName.get(candidate.teamId) ?? "khác") : null,
    }));
}

/** Ô nhập tài khoản mới cho hồ sơ nhân viên vừa được tick (chỉ Quản trị). */
function NewAccountFields({ index, register, errors }: { index: number; register: UseFormRegister<TeamFormValues>; errors: FieldErrors<TeamFormValues> }) {
  const fieldErrors = errors.newMembers?.[index];
  return (
    <div className="mt-2 ml-6 grid gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Input aria-label="Tên đăng nhập" placeholder="Tên đăng nhập" autoComplete="off" aria-invalid={Boolean(fieldErrors?.username)} {...register(`newMembers.${index}.username`)} />
        {fieldErrors?.username && <p className="text-xs text-destructive">{fieldErrors.username.message}</p>}
        {fieldErrors?.employeeId && <p className="text-xs text-destructive">{fieldErrors.employeeId.message}</p>}
      </div>
      <div className="space-y-1">
        <Input aria-label="Mật khẩu ban đầu" placeholder="Mật khẩu ban đầu (≥ 8 ký tự)" type="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors?.password)} {...register(`newMembers.${index}.password`)} />
        {fieldErrors?.password && <p className="text-xs text-destructive">{fieldErrors.password.message}</p>}
      </div>
    </div>
  );
}

/**
 * QUẢN TRỊ: tạo / sửa nhóm. Trưởng nhóm chọn được mọi tài khoản đang hoạt động (Nhân viên sẽ được nâng
 * lên Quản lý khi lưu). Thành viên gồm cả hồ sơ nhân viên chưa có tài khoản: tick vào thì nhập tên đăng nhập
 * và mật khẩu ban đầu, hệ thống tạo tài khoản trong cùng lần lưu. Mỗi người chỉ thuộc một nhóm.
 */
export function TeamDialog({ team, teams, candidates, onClose }: { team?: Team; teams: Team[]; candidates: TeamCandidate[]; onClose: () => void }) {
  const form = useForm<TeamFormValues, unknown, TeamInput>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: team?.name ?? "",
      description: team?.description ?? "",
      managerId: team?.managerId ?? null,
      memberIds: team?.memberIds ?? [],
      newMembers: [],
    },
  });
  const { errors } = form.formState;
  const newMembers = useFieldArray({ control: form.control, name: "newMembers" });
  const memberIds = (useWatch({ control: form.control, name: "memberIds" }) ?? []).map(Number);
  const managerId = useWatch({ control: form.control, name: "managerId" });
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(TEAMS.key, TEAMS.path, RELATED),
    id: team?.id,
    setError: form.setError,
    successMessage: team ? "Đã lưu nhóm" : "Đã tạo nhóm",
    onDone: onClose,
  });

  const accounts = candidates.filter((c) => c.userId !== null && c.active);
  const leaders = accounts.map((c) => ({ value: String(c.userId), label: `${c.name} (${ROLE_LABELS[c.role!]})` }));
  const leader = accounts.find((c) => c.userId === Number(managerId));
  const rows = rowsOf(candidates, teams, team);
  const taken = new Set([...candidates.map((c) => c.username).filter(Boolean), ...newMembers.fields.map((f) => f.username)] as string[]);

  const toggleAccount = (userId: number, checked: boolean) => {
    const next = new Set(memberIds);
    if (checked) next.add(userId);
    else next.delete(userId);
    form.setValue("memberIds", [...next], { shouldDirty: true });
  };
  const toggleProfile = (candidate: TeamCandidate, checked: boolean) => {
    const index = newMembers.fields.findIndex((f) => f.employeeId === candidate.employeeId);
    if (checked && index < 0) newMembers.append({ employeeId: candidate.employeeId!, username: suggestUsername(candidate.name, taken), password: "" });
    if (!checked && index >= 0) newMembers.remove(index);
  };

  return (
    <FormDialog open onClose={onClose} title={team ? "Sửa nhóm" : "Tạo nhóm"} size="lg" error={formError} pending={pending} onSubmit={form.handleSubmit(save)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên nhóm" error={errors.name} {...form.register("name")} />
        <SelectField
          control={form.control}
          name="managerId"
          label="Trưởng nhóm"
          placeholder="Chọn trưởng nhóm"
          options={leaders}
          hint={
            leader?.role === "employee"
              ? `Khi lưu, ${leader.name} sẽ được nâng lên vai trò Quản lý.`
              : "Trưởng nhóm thấy và giao việc cho thành viên nhóm mình."
          }
        />
      </div>
      <TextareaField label="Mô tả" rows={2} error={errors.description} {...form.register("description")} />
      <Field
        label={`Thành viên (${memberIds.length + newMembers.fields.length})`}
        error={errors.memberIds ?? (errors.newMembers?.root as { message?: string } | undefined) ?? errors.newMembers}
        hint={`Tick nhân viên chưa có tài khoản để tạo tài khoản cho họ (tối đa ${MAX_NEW_MEMBER_ACCOUNTS} người mỗi lần lưu).`}
      >
        {() => (
          <div className="grid max-h-80 gap-0.5 overflow-y-auto rounded-lg border p-1.5">
            {rows.map((row) => {
              const { candidate } = row;
              if (candidate.userId !== null) {
                return (
                  <MemberRow
                    key={candidate.key}
                    row={row}
                    checked={memberIds.includes(candidate.userId)}
                    disabled={Boolean(row.elsewhere)}
                    note={row.elsewhere ? `đang ở nhóm ${row.elsewhere}` : undefined}
                    onToggle={(checked) => toggleAccount(candidate.userId!, checked)}
                  />
                );
              }
              const index = newMembers.fields.findIndex((f) => f.employeeId === candidate.employeeId);
              const full = index < 0 && newMembers.fields.length >= MAX_NEW_MEMBER_ACCOUNTS;
              return (
                <MemberRow
                  key={candidate.key}
                  row={row}
                  checked={index >= 0}
                  disabled={full}
                  note={index >= 0 ? "sẽ tạo tài khoản Nhân viên" : full ? "lưu trước rồi thêm tiếp" : undefined}
                  onToggle={(checked) => toggleProfile(candidate, checked)}
                >
                  {index >= 0 && <NewAccountFields index={index} register={form.register} errors={errors} />}
                </MemberRow>
              );
            })}
          </div>
        )}
      </Field>
    </FormDialog>
  );
}

/**
 * QUẢN LÝ: thêm / bớt thành viên cho nhóm mình. Chỉ chọn được người đã có tài khoản và chưa thuộc nhóm khác;
 * nhân viên chưa có tài khoản hiện mờ, cần Quản trị tạo tài khoản trước.
 */
export function TeamMembersDialog({ team, teams, candidates, onClose }: { team: Team; teams: Team[]; candidates: TeamCandidate[]; onClose: () => void }) {
  const client = useQueryClient();
  const form = useForm<TeamMembersValues, unknown, TeamMembersInput>({
    resolver: zodResolver(teamMembersSchema),
    defaultValues: { memberIds: team.memberIds },
  });
  const memberIds = (useWatch({ control: form.control, name: "memberIds" }) ?? []).map(Number);
  const mutation = useMutation({
    mutationFn: ({ body }: { id?: number; body: unknown }) => apiRequest<Team>(`${TEAMS.path}/${team.id}/members`, { method: "PUT", body }),
    onSuccess: () => refreshAfterChange(client, TEAMS.key, ...RELATED),
  });
  const { save, formError, pending } = useSaveForm({
    mutation,
    setError: form.setError,
    successMessage: "Đã cập nhật thành viên",
    onDone: onClose,
  });
  const rows = rowsOf(candidates, teams, team).filter((row) => row.candidate.userId !== team.managerId);

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Thành viên nhóm ${team.name}`}
      description="Thành viên trong nhóm là những người bạn được giao việc."
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <Field label={`Thành viên (${memberIds.length})`} error={form.formState.errors.memberIds}>
        {() => (
          <div className="grid max-h-80 gap-0.5 overflow-y-auto rounded-lg border p-1.5">
            {rows.map((row) => {
              const userId = row.candidate.userId;
              const note = userId === null ? "nhờ Quản trị tạo tài khoản" : row.elsewhere ? `đang ở nhóm ${row.elsewhere}` : undefined;
              return (
                <MemberRow
                  key={row.candidate.key}
                  row={row}
                  checked={userId !== null && memberIds.includes(userId)}
                  disabled={userId === null || Boolean(row.elsewhere)}
                  note={note}
                  onToggle={(checked) => {
                    const next = new Set(memberIds);
                    if (checked) next.add(userId!);
                    else next.delete(userId!);
                    form.setValue("memberIds", [...next], { shouldDirty: true });
                  }}
                />
              );
            })}
          </div>
        )}
      </Field>
    </FormDialog>
  );
}
