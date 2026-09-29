---
name: build
description: 구현 단계. 프로젝트 생성, 기능 개발, 테스트, CI/CD, 배포 설정 시 사용.
---

# Build — 구현

## 절차
1. PROJECT.md 의 스택으로 프로젝트를 만든다. CLAUDE.md 를 함께 생성한다.
2. MVP Must 기능을 하나씩 구현한다. 기능마다 테스트를 쓴다.
3. CI(린트·타입체크·테스트)를 세팅한다.
4. 배포를 세팅한다. 비밀값은 환경변수로만 다룬다.
5. 기능마다 코드 리뷰(`/code-review`)를 돌린다.

## 완료 조건
- MVP 기능 동작, CI 통과, 배포 URL 또는 빌드 파일 존재

## 참고 자료 (TODO)
- references/stack-templates.md

