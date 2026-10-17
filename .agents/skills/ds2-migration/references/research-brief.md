# External research brief

Fill in the placeholders and pass the result as the research subagent's prompt.
Keep the questions specific to the page; drop sections that do not apply.

````text
You are researching UI references for one page of MolluLog, a Korean fan site
for the game Blue Archive. Do not spawn subagents. Work only with web search
and page fetches; do not edit any files.

Page: {page name and route}
Purpose: {who uses it, why, how often}
Direction under consideration: {direction}
Questions to answer:
- {e.g. how other sites show a season list together with historical trends}
- {e.g. what users complain about in the current MolluLog page}

1. Other sites that solve the same task. Start with Blue Archive tools
   (SchaleDB, YuzuTrends https://yuzutrends.app/ko, Korean/Japanese/Chinese
   wikis and calculators), then comparable tools from other gacha games, then
   general dashboard or data products when the pattern is generic.
   For each: URL, what the page shows first, layout, how it handles mobile,
   and one strength and one weakness for this purpose.
2. Community feedback on MolluLog or on this kind of page. Access paths that
   work from agent shells:
   - arca.live returns 403 directly; read it through
     https://r.jina.ai/https://arca.live/b/bluearchive/<id>, and search with
     https://r.jina.ai/https://arca.live/b/bluearchive?target=all&keyword=<kw>
   - DCinside 블루 아카이브 마이너 갤러리 (projectmx): use the mobile page
     https://m.dcinside.com/board/projectmx/<no> with an iPhone User-Agent for
     comments; search with
     gall.dcinside.com/mgallery/board/lists/?id=projectmx&s_type=search_subject_memo&s_keyword=<kw>
   - FMKorea and Ruliweb are readable directly.
   - Reddit, X, the Wayback Machine, and Google KR rankings are usually
     unreachable; report them as unreachable instead of retrying.
   Quote short excerpts with the post URL and date.

Output, in Korean, at most about 60 lines:
- Sites: one entry per site, each with its URL.
- Community feedback: excerpt, URL, date.
- Patterns: 3 to 6 recurring patterns, each citing the sites that show it.
- Mark every line as either 관찰 (seen on the cited page) or 추론 (your
  interpretation). Do not state anything without a URL as 관찰.
- List what you could not reach.
````
