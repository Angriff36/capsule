import { useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import {
  announcementStaffActions,
  staffActionNeedsConfirm,
} from "../../agent/CapsuleStaffActionOffer";
import { api } from "../../lib/api";
import {
  useAnnouncementRemove,
  useCreateAnnouncement,
  useListAnnouncement,
} from "../../lib/manifest-convex-react";
import {
  ErrorState,
  PageHeader,
  Section,
  TableSkeleton,
} from "../../ui/primitives";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import { useActionPrompt } from "../../ui/action-prompt";

/** Clearer words than the generated enum name, keyed by the generated value. */
const FRIENDLY_CATEGORY: Record<string, string> = {
  policyUpdate: "New policy",
  safety: "Safety reminder",
  training: "Upcoming training",
  general: "General notice",
};

function categoryChoices(post: {
  fields: ReadonlyArray<{
    name: string;
    choices?: ReadonlyArray<{ value: string; label: string }>;
  }>;
}) {
  const field = post.fields.find((item) => item.name === "category");
  return (field?.choices ?? []).map((choice) => ({
    value: choice.value,
    label: FRIENDLY_CATEGORY[choice.value] ?? choice.label,
  }));
}

// Manifest `post`/`remove` commands gate on the manageAccess capability, which
// manager + every *_manager role + admin/owner/system inherit. The UI gate
// only shapes the form; the command policy is the real enforcement.
const canManageAnnouncements = (role: string | undefined) =>
  role === "manager" ||
  role === "admin" ||
  role === "owner" ||
  role === "system" ||
  Boolean(role?.endsWith("_manager"));

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function AnnouncementsPage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const announcements = useListAnnouncement();
  const createAnnouncement = useCreateAnnouncement();
  const removeAnnouncement = useAnnouncementRemove();

  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const offers = useMemo(() => announcementStaffActions(), []);
  const post = offers.forPerson("Announcement.post");
  const removeOffer = offers.forPerson("Announcement.remove");
  const categories = post ? categoryChoices(post) : [];
  const { prompt, host: confirmHost } = useActionPrompt(removingId != null);

  const canManage = canManageAnnouncements(authStatus?.role);

  const rows = useMemo(
    () =>
      (announcements ?? [])
        .slice()
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [announcements],
  );
  const now = Date.now();
  const activeCount = rows.filter(
    (r) => r.deletedAt == null && r.expiresAt != null && r.expiresAt > now,
  ).length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    const category = String(data.get("category") ?? "general");
    const expiresRaw = String(data.get("expiresAt") ?? "");
    const titleRequired = post?.fields.some(
      (field) => field.name === "title" && field.required,
    );
    const bodyRequired = post?.fields.some(
      (field) => field.name === "body" && field.required,
    );
    const expiresRequired = post?.fields.some(
      (field) => field.name === "expiresAt" && field.required,
    );
    if (
      (titleRequired && !title) ||
      (bodyRequired && !body) ||
      (expiresRequired && !expiresRaw)
    ) {
      setError(
        "Give this announcement a title, a message, and an expiry date.",
      );
      return;
    }
    const expiresAt = new Date(`${expiresRaw}T23:59:59.999`).getTime();
    setBusy(true);
    setError(null);
    setNotice(null);
    void (async () => {
      try {
        await createAnnouncement({
          title,
          body,
          category: category as never,
          expiresAt,
        });
        form.reset();
        setNotice("Announcement posted — it is now pinned for all members.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not post.");
      } finally {
        setBusy(false);
      }
    })();
  };

  const remove = (id: string, version: number) => {
    if (!canManage || removingId != null || !removeOffer) return;
    void (async () => {
      if (staffActionNeedsConfirm(removeOffer)) {
        const confirmed = await prompt.askConfirm({
          title: removeOffer.label,
          description: "This announcement comes off the board for everyone.",
          confirmLabel: removeOffer.label,
          tone: "danger",
        });
        if (!confirmed) return;
      }
      setRemovingId(id);
      setError(null);
      setNotice(null);
      try {
        await removeAnnouncement({ docId: id as never, version });
        setNotice(
          "Announcement removed — the banner is taken down for everyone.",
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not remove.");
      } finally {
        setRemovingId(null);
      }
    })();
  };

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Announcements"
        lead="Post pinned banners (new policy, safety reminder, upcoming training) that every member sees until they expire or are dismissed."
        actions={
          <span className="text-sm text-ink-3">{activeCount} active</span>
        }
      />
      <AdminWorkspaceNav />
      {!canManage ? (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-base text-warn">
          Only organization managers can post or remove announcements. Members
          see them as banners and dismiss them individually.
        </div>
      ) : null}
      {error ? (
        <ErrorState title="Could not save announcement" detail={error} />
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {confirmHost}

      {canManage && post ? (
        <Section title="Post an announcement">
          <form
            className="supply-form grid gap-4 border-0 p-4 sm:grid-cols-2"
            onSubmit={submit}
          >
            <label className="field-label sm:col-span-2">
              Title
              <input
                name="title"
                className="input"
                placeholder="New allergy-awareness procedure"
                required={post.fields.some(
                  (field) => field.name === "title" && field.required,
                )}
                disabled={busy}
                maxLength={120}
              />
            </label>
            <label className="field-label sm:col-span-2">
              Message
              <textarea
                name="body"
                className="input"
                rows={3}
                placeholder="Everyone must review the updated cross-contact protocol before Friday's service."
                required={post.fields.some(
                  (field) => field.name === "body" && field.required,
                )}
                disabled={busy}
                maxLength={1000}
              />
            </label>
            <label className="field-label">
              Type
              <select
                name="category"
                className="input"
                defaultValue="general"
                disabled={busy}
                required={post.fields.some(
                  (field) => field.name === "category" && field.required,
                )}
              >
                {categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Expires
              <BoundedDateInput
                name="expiresAt"
                className="input"
                required={post.fields.some(
                  (field) => field.name === "expiresAt" && field.required,
                )}
                disabled={busy}
              />
            </label>
            <div className="supply-row-actions sm:col-span-2">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Posting…" : post.label}
              </button>
            </div>
          </form>
        </Section>
      ) : null}

      <Section title="All announcements" count={rows.length}>
        {announcements === undefined || authStatus === undefined ? (
          <TableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <div className="document-empty">
            <p>No announcements have been posted.</p>
            <span>Post one above to pin a banner for the whole team.</span>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const expired = row.expiresAt != null && row.expiresAt <= now;
              const removed = row.deletedAt != null;
              return (
                <li
                  key={row._id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3"
                  data-testid="announcement-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-ink">
                        {row.title}
                      </span>
                      <span className="chip border-line-2 bg-inset text-ink-2">
                        {FRIENDLY_CATEGORY[String(row.category)] ??
                          String(row.category)}
                      </span>
                      {removed ? (
                        <span className="chip border-line-2 bg-inset text-ink-3">
                          Removed
                        </span>
                      ) : expired ? (
                        <span className="chip border-line-2 bg-inset text-ink-3">
                          Expired
                        </span>
                      ) : (
                        <span className="chip border-ok/30 bg-ok-soft text-ok">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
                      {row.body}
                    </p>
                    <p className="mt-1 text-2xs text-ink-3">
                      Expires {dateFormat.format(row.expiresAt as number)}
                    </p>
                  </div>
                  {canManage && removeOffer && !removed ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        remove(String(row._id), row.version as number)
                      }
                      disabled={removingId != null}
                    >
                      {removingId === String(row._id)
                        ? "Removing…"
                        : removeOffer.label}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
