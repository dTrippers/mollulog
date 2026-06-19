alter table feedback_tickets add column lastSeenAdminReplyId integer not null default 0;

create index if not exists coupons_expiresAt on coupons (expiresAt);
create index if not exists feedback_replies_ticket_admin_id on feedback_replies (ticketId, isAdmin, id);

update feedback_tickets
set lastSeenAdminReplyId = coalesce((
  select max(feedback_replies.id)
  from feedback_replies
  where feedback_replies.ticketId = feedback_tickets.id
    and feedback_replies.isAdmin = 1
), 0);
