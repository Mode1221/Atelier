#!/usr/bin/env bash
# 로컬 AI 회사(company/) 가 있는 프로젝트를 작업 폴더에 깐다
set -e
cp -R "$(dirname "$0")/fixture/." .
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
