alter table senseis add column githubId text;
create unique index if not exists senseis_githubId on senseis (githubId);
