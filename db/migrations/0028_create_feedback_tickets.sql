create table feedback_tickets (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  title text not null,
  content text not null,
  status text not null default 'waiting',
  replyEmail text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists feedback_tickets_uid on feedback_tickets (uid);
create index if not exists feedback_tickets_userId on feedback_tickets (userId);

create table feedback_replies (
  id integer primary key autoincrement,
  uid text not null,
  ticketId integer not null,
  userId integer not null,
  isAdmin integer not null default 0,
  content text not null,
  createdAt text not null default current_timestamp,
  foreign key (ticketId) references feedback_tickets(id) on delete cascade
);

create unique index if not exists feedback_replies_uid on feedback_replies (uid);
create index if not exists feedback_replies_ticketId on feedback_replies (ticketId);
