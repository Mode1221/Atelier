#!/usr/bin/env bash
# 4단계 구현 중간의 프로젝트를 작업 폴더에 깐다 (빠른 길: B6·B7·B11·B15 는 나중)
set -e
cp -R "$(dirname "$0")/fixture/." .
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
