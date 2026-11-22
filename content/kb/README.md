# Knowledge-base content

This is the team's curated, source-cited content. Every history claim in the app comes from here, and the app only ever shows rows a team member has marked `reviewed`.

## Editing

Edit `entries.csv` in a spreadsheet or text editor, then import it. Re-importing matches rows by `id`. Unchanged rows are skipped, so reviewed rows stay reviewed. A new row is inserted as `draft`. A changed row is updated and reset to `draft` with `reviewed_by` cleared, so it needs review again. The import prints inserted / updated / unchanged counts. The whole file is validated first, and nothing is written if any row is invalid.

Rows titled `[DEV] ...` are development placeholders, not real content. Do not review them.

## Columns

`id,kind,title,body,tags,difficulty,tools,steps,sources`

| Column | Format |
| --- | --- |
| `id` | Stable slug, unique in the file (stored as `slug`). |
| `kind` | `history`, `redesign` or `fabric`. |
| `title`, `body` | Plain text. |
| `tags` | `|`-separated, lowercase, from the fixed vocabulary in `lib/domain/vocabulary.ts`. History tags must be Named Styles. |
| `difficulty` | `beginner`, `intermediate` or `advanced`. Required for `redesign`. |
| `tools` | `|`-separated list. |
| `steps` | `|`-separated list. Required (non-empty) for `redesign`. |
| `sources` | JSON array of `{"citation","url","accessed"}`. Required (non-empty) for `history`; `url` must be http(s). In CSV, double every `"` inside the field. |

## Commands

```
npm run kb:import                                  # upsert content/kb/entries.csv as drafts
npm run kb:review -- <id> "<reviewer name>"        # mark one row reviewed
```

Both need the Supabase service credentials in the environment. `kb:review` re-validates the stored row: it refuses an unknown id, a history row without sources, a malformed source (needs citation, accessed date, http(s) url), and a history tag that is not a Named Style. Check each source link yourself before reviewing.

## Rule: unverifiable sources

A history entry whose source cannot be verified is dropped, not softened. Do not hedge the wording or keep it with a weaker claim; delete the row.
