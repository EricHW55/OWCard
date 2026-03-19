"""
영웅 스킬 모듈.

이 폴더에 영웅별 .py 파일을 추가하면
@register_skill / @register_passive 데코레이터로 자동 등록됩니다.

새 영웅 추가 시:
  1. heroes/new_hero.py 파일 생성
  2. @register_skill("new_hero", "skill_1") 으로 스킬 등록
  3. 여기 import 추가
"""

# 영웅 모듈 import (추가될 때마다 여기에 한 줄 추가)
from game_engine.heroes import tanks
from game_engine.heroes import dealers
from game_engine.heroes import healers
from game_engine.heroes import spells