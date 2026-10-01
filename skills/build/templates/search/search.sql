-- 검색 색인 (Atelier search 템플릿) — 한국어 부분 일치를 위해 trigram(3글자 조각) 색인.
-- 마이그레이션이 tokenize 오류로 실패하면 tokenize='unicode61' 로 바꾼다(그땐 낱말 단위 검색).
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(kind UNINDEXED, ref UNINDEXED, title, body, tokenize='trigram');
