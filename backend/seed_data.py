"""
초기 카드 시드 데이터 (v2).

hero_key가 game_engine/heroes/의 스킬 함수와 연결됩니다.
skill_damages에는 숫자만, 스킬 동작은 코드에 있습니다.

새 영웅 추가:
  1. 여기에 데이터 추가
  2. game_engine/heroes/에 스킬 함수 작성
  3. hero_key를 일치시키면 자동 연결
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.card import CardTemplate


SEED_CARDS = [
    # ═══════════════════════════════════════════
    #  탱커 (cost=2)
    # ═══════════════════════════════════════════
    {
        "hero_key": "reinhardt",
        "name": "라인하르트",
        "role": "tank",
        "hp": 20,  # +15 방벽은 패시브로 처리
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "방벽 방패로 아군을 보호. 화염강타로 방벽 무시 공격.",
        "skill_damages": {
            "skill_1": 6,        # 화염강타
        },
        "skill_meta": {
            "skill_1": {"name": "화염강타", "cooldown": 0},
        },
        "extra": {"barrier_hp": 15},  # 패시브 방벽 내구도
    },
    {
        "hero_key": "winston",
        "name": "윈스턴",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "테슬라 캐논으로 광역 공격. 방벽 생성기로 아군 보호.",
        "skill_damages": {
            "skill_1": 4,        # 테슬라 캐논
        },
        "skill_meta": {
            "skill_1": {"name": "테슬라 캐논", "cooldown": 0},
            "skill_2": {"name": "방벽 생성기", "cooldown": 0},
        },
        "extra": {"barrier_hp": 5},
    },
    {
        "hero_key": "dva",
        "name": "디바",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "부스터로 킬캐치. 마이크로 미사일은 근접할수록 강력.",
        "skill_damages": {
            "skill_1": 6,              # 부스터
            "skill_2": [8, 5, 3, 1],   # 마이크로 미사일 (거리1~4)
        },
        "skill_meta": {
            "skill_1": {"name": "부스터", "cooldown": 0},
            "skill_2": {"name": "마이크로 미사일", "cooldown": 0},
        },
        "extra": {"hana_hp": 5},  # 송하나 체력
    },
    {
        "hero_key": "zarya",
        "name": "자리야",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "입자 방벽으로 첫 공격 무효화. 피격 시 딜 증가.",
        "skill_damages": {
            "skill_1": 0,    # 입자 방벽 (데미지 없음)
            "skill_2": 5,    # 입자포 (+ 피격 보너스 3)
        },
        "skill_meta": {
            "skill_1": {"name": "입자 방벽", "cooldown": 0},
            "skill_2": {"name": "입자포", "cooldown": 0},
        },
        "extra": {"particle_bonus": 3},
    },
    {
        "hero_key": "wrecking_ball",
        "name": "레킹볼",
        "role": "tank",
        "hp": 25,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "갈고리로 본대/사이드 이동 자유. 파일드라이버 공격.",
        "skill_damages": {
            "skill_1": 6,    # 파일드라이버
        },
        "skill_meta": {
            "skill_1": {"name": "파일드라이버", "cooldown": 0},
        },
    },
    {
        "hero_key": "junkerqueen",
        "name": "정커퀸",
        "role": "tank",
        "hp": 22,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "톱니칼로 적을 끌어당기고, 지휘의 외침으로 아군 추가 체력.",
        "skill_damages": {
            "skill_1": 3,    # 톱니칼
        },
        "skill_meta": {
            "skill_1": {"name": "톱니칼", "cooldown": 0},
            "skill_2": {"name": "지휘의 외침", "cooldown": 0},
        },
        "extra": {"shout_extra_hp": 2},
    },
    {
        "hero_key": "doomfist",
        "name": "둠피스트",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "로켓 펀치로 관통 딜. 파워블락으로 피해 감소 + 강화.",
        "skill_damages": {
            "skill_1": [5, 3],       # 로켓 펀치 [대상, 뒤 카드]
            "skill_1_empowered": 6,  # 강화 로켓 펀치
        },
        "skill_meta": {
            "skill_1": {"name": "로켓 펀치", "cooldown": 0},
            "skill_2": {"name": "파워블락", "cooldown": 0},
        },
    },
    {
        "hero_key": "sigma",
        "name": "시그마",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "실험용 방벽(도발)으로 적의 공격을 유도. 초재생으로 복구.",
        "skill_damages": {},
        "skill_meta": {
            "skill_1": {"name": "실험용 방벽", "cooldown": 0},
            "skill_2": {"name": "초재생", "cooldown": 0},
        },
        "extra": {"barrier_hp": 10, "regen_amount": 5},
    },
    {
        "hero_key": "ramattra",
        "name": "라마트라",
        "role": "tank",
        "hp": 20,
        "cost": 2,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "폼 체인지로 역할 전환. 일반=탐식(사거리감소+딜), 네메시스=막기(피해감소).",
        "skill_damages": {
            "skill_1": 2,    # 탐식의 소용돌이
        },
        "skill_meta": {
            "skill_1": {"name": "탐식의 소용돌이", "cooldown": 0},
            "skill_2": {"name": "폼 체인지", "cooldown": 0},
            "skill_3": {"name": "막기", "cooldown": 0},
        },
        "extra": {"nemesis_bonus_hp": 10, "block_reduction": 50},
    },

    # ═══════════════════════════════════════════
    #  딜러 (cost=1)
    # ═══════════════════════════════════════════
    {
        "hero_key": "bastion",
        "name": "바스티온",
        "role": "dealer",
        "hp": 12,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "강습 모드로 강한 딜, 수색 모드로 약한 딜. 연속 사용 불가.",
        "skill_damages": {
            "skill_1": 10,   # 강습
            "skill_2": 2,    # 수색
        },
        "skill_meta": {
            "skill_1": {"name": "설정: 강습", "cooldown": 0},
            "skill_2": {"name": "설정: 수색", "cooldown": 0},
        },
    },
    {
        "hero_key": "pharah",
        "name": "프레야",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "상승기류로 한칸 무시 공격. 공중에서는 피격도 쉬움.",
        "skill_damages": {
            "skill_1": 8,    # 정조준
        },
        "skill_meta": {
            "skill_1": {"name": "상승기류+정조준", "cooldown": 0},
        },
    },
    {
        "hero_key": "tracer",
        "name": "트레이서",
        "role": "dealer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "점멸로 한 단계 무시 공격. 역행으로 체력 복구.",
        "skill_damages": {
            "skill_1": 5,    # 쌍권총
        },
        "skill_meta": {
            "skill_1": {"name": "펄스 쌍권총", "cooldown": 0},
            "skill_2": {"name": "역행", "cooldown": 0},
        },
    },
    {
        "hero_key": "widowmaker",
        "name": "위도우메이커",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 99,  # 명사수: 거리 무시
        "description": "명사수 패시브. 25% 헤드샷 3배 데미지.",
        "skill_damages": {
            "skill_1": 4,    # 죽음의 입맞춤
        },
        "skill_meta": {
            "skill_1": {"name": "죽음의 입맞춤", "cooldown": 0},
        },
    },
    {
        "hero_key": "hanzo",
        "name": "한조",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 99,  # 명사수
        "description": "명사수 패시브. 25% 헤드샷 2배 데미지.",
        "skill_damages": {
            "skill_1": 5,    # 폭풍활
        },
        "skill_meta": {
            "skill_1": {"name": "폭풍활", "cooldown": 0},
        },
    },
    {
        "hero_key": "venture",
        "name": "벤처",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "잠복으로 타겟팅 회피 + 한칸 무시. 연속 사용 불가.",
        "skill_damages": {
            "skill_1": 7,    # 잠복 공격
            "skill_2": 3,    # 스마트 굴착기
        },
        "skill_meta": {
            "skill_1": {"name": "잠복", "cooldown": 0},
            "skill_2": {"name": "스마트 굴착기", "cooldown": 0},
        },
    },
    {
        "hero_key": "sombra",
        "name": "솜브라",
        "role": "dealer",
        "hp": 8,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "기회주의자로 설치 스킬 탐지. 은신으로 회피+힐.",
        "skill_damages": {
            "skill_1": 5,    # 기관단총
        },
        "skill_meta": {
            "skill_1": {"name": "기관단총", "cooldown": 0},
            "skill_2": {"name": "은신", "cooldown": 0},
        },
        "extra": {"stealth_heal": 3},
    },
    {
        "hero_key": "echo",
        "name": "에코",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "점착폭탄(즉시+폭발). 광선집중은 반피 이하에 1.5배.",
        "skill_damages": {
            "skill_1": [4, 4],   # 점착폭탄 [즉시, 폭발]
            "skill_2": 6,        # 광선집중 (반피이하 9)
        },
        "skill_meta": {
            "skill_1": {"name": "점착폭탄", "cooldown": 0},
            "skill_2": {"name": "광선집중", "cooldown": 0},
        },
    },
    {
        "hero_key": "cassidy",
        "name": "캐서디",
        "role": "dealer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 3,
        "description": "난사: 탱커에 강하고 멀수록 약해짐.",
        "skill_damages": {
            "skill_1": [8, 4, 2],    # 거리1~3
        },
        "skill_meta": {
            "skill_1": {"name": "난사", "cooldown": 0},
        },
    },
    {
        "hero_key": "reaper",
        "name": "리퍼",
        "role": "dealer",
        "hp": 12,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 3,
        "description": "헬파이어 샷건: 근접 강력, 원거리 약함.",
        "skill_damages": {
            "skill_1": [8, 4, 1],    # 거리1~3
        },
        "skill_meta": {
            "skill_1": {"name": "헬파이어 샷건", "cooldown": 0},
        },
    },
    {
        "hero_key": "mei",
        "name": "메이",
        "role": "dealer",
        "hp": 15,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "급속 빙결: 사망 시 한턴 얼음 → 반피 부활.",
        "skill_damages": {
            "skill_1": 5,    # 냉각총
        },
        "skill_meta": {
            "skill_1": {"name": "냉각총", "cooldown": 0},
        },
    },
    {
        "hero_key": "ashe",
        "name": "애쉬",
        "role": "dealer",
        "hp": 12,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "바이퍼 + 다이너마이트 화상.",
        "skill_damages": {
            "skill_1": 6,    # 바이퍼
        },
        "skill_meta": {
            "skill_1": {"name": "바이퍼", "cooldown": 0},
            "skill_2": {"name": "다이너마이트", "cooldown": 0},
        },
        "extra": {"burn_damage": 1, "burn_duration": 3},
    },
    {
        "hero_key": "soldier76",
        "name": "솔져:76",
        "role": "dealer",
        "hp": 12,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "생체장으로 가로줄 힐. 펄스 소총 딜.",
        "skill_damages": {
            "skill_1": 3,    # 생체장 (힐량)
            "skill_2": 6,    # 펄스 소총
        },
        "skill_meta": {
            "skill_1": {"name": "생체장", "cooldown": 0},
            "skill_2": {"name": "펄스 소총", "cooldown": 0},
        },
    },
    {
        "hero_key": "symmetra",
        "name": "시메트라",
        "role": "dealer",
        "hp": 12,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "순간이동기로 아군 이동. 광자 발사기는 차징식.",
        "skill_damages": {
            "skill_2": [2, 4, 8],    # 광자 발사기 (차징 0~2)
        },
        "skill_meta": {
            "skill_1": {"name": "순간이동기", "cooldown": 0},
            "skill_2": {"name": "광자 발사기", "cooldown": 0},
        },
    },
    {
        "hero_key": "torbjorn",
        "name": "토르비욘",
        "role": "dealer",
        "hp": 14,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "포탑 설치. 대못 발사기 + 대장간 망치 수리.",
        "skill_damages": {
            "skill_1": 4,    # 대못 발사기
        },
        "skill_meta": {
            "skill_1": {"name": "대못 발사기", "cooldown": 0},
            "skill_2": {"name": "대장간 망치", "cooldown": 0},
        },
        "extra": {"turret_hp": 5, "turret_damage": 2, "repair_amount": 3},
    },
    {
        "hero_key": "sojourn",
        "name": "소전",
        "role": "dealer",
        "hp": 8,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "레일건으로 차징. 차징샷은 관통 고데미지.",
        "skill_damages": {
            "skill_1": 2,          # 레일건 (기본)
            "skill_2": [2, 5, 8],  # 차징샷 (단계별)
        },
        "skill_meta": {
            "skill_1": {"name": "레일건", "cooldown": 0},
            "skill_2": {"name": "차징샷", "cooldown": 0},
        },
    },

    # ═══════════════════════════════════════════
    #  힐러 (cost=1)
    # ═══════════════════════════════════════════
    {
        "hero_key": "ana",
        "name": "아나",
        "role": "healer",
        "hp": 7,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 3,
        "description": "생체 소총: 아군 힐 / 적 딜 겸용.",
        "skill_damages": {
            "skill_1": {"heal": 5, "damage": 3},
        },
        "skill_meta": {
            "skill_1": {"name": "생체 소총", "cooldown": 0},
        },
    },
    {
        "hero_key": "lucio",
        "name": "루시우",
        "role": "healer",
        "hp": 8,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "본대=광역힐, 사이드=이속. 소리파동으로 사거리 감소.",
        "skill_damages": {
            "skill_1": {"heal": 2},
        },
        "skill_meta": {
            "skill_1": {"name": "볼륨업", "cooldown": 0},
            "skill_2": {"name": "소리 파동", "cooldown": 0},
        },
    },
    {
        "hero_key": "kiriko",
        "name": "키리코",
        "role": "healer",
        "hp": 8,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "본대=힐부적, 사이드=쿠나이 딜. 순보로 자동 복귀.",
        "skill_damages": {
            "skill_1": {"heal": 4, "damage": 5},
        },
        "skill_meta": {
            "skill_1": {"name": "힐부적/쿠나이", "cooldown": 0},
        },
        "extra": {"swift_step_threshold": 4},
    },
    {
        "hero_key": "moira",
        "name": "모이라",
        "role": "healer",
        "hp": 7,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "생체 구슬로 딜 → 충전 → 생체 손아귀로 세로줄 강힐.",
        "skill_damages": {
            "skill_1": 5,    # 생체 손아귀 (충전식 힐)
            "skill_2": 2,    # 생체 구슬 (딜)
        },
        "skill_meta": {
            "skill_1": {"name": "생체 손아귀", "cooldown": 0},
            "skill_2": {"name": "생체 구슬", "cooldown": 0},
        },
    },
    {
        "hero_key": "zenyatta",
        "name": "젠야타",
        "role": "healer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "부조화로 적 피해 증가. 조화로 단일 힐.",
        "skill_damages": {
            "skill_2": 3,    # 조화 (힐)
        },
        "skill_meta": {
            "skill_1": {"name": "부조화", "cooldown": 0},
            "skill_2": {"name": "조화", "cooldown": 0},
        },
        "extra": {"discord_value": 2},
    },
    {
        "hero_key": "lifeweaver",
        "name": "우양",
        "role": "healer",
        "hp": 7,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "수호의 파도: 아군 힐증, 적 넉백. 회복의 물결 힐.",
        "skill_damages": {
            "skill_2": 3,    # 회복의 물결 (힐)
        },
        "skill_meta": {
            "skill_1": {"name": "수호의 파도", "cooldown": 0},
            "skill_2": {"name": "회복의 물결", "cooldown": 0},
        },
        "extra": {"heal_amplify": 2, "knockback_value": 1},
    },
    {
        "hero_key": "mizuki",
        "name": "미즈키",
        "role": "healer",
        "hp": 7,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "속박사슬로 사이드 견제. 치유의 삿갓으로 랜덤 힐.",
        "skill_damages": {},
        "skill_meta": {
            "skill_1": {"name": "속박사슬", "cooldown": 0},
            "skill_2": {"name": "치유의 삿갓", "cooldown": 0},
        },
        "extra": {"kasa_total_heal": 5},
    },
    {
        "hero_key": "baptiste",
        "name": "바티스트",
        "role": "healer",
        "hp": 8,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "생체탄 발사기로 가로줄 광역 힐.",
        "skill_damages": {
            "skill_1": 3,    # 광역 힐
            "skill_2": 3,    # 딜
        },
        "skill_meta": {
            "skill_1": {"name": "생체탄 발사기", "cooldown": 0},
            "skill_2": {"name": "공격", "cooldown": 0},
        },
    },
    {
        "hero_key": "mercy",
        "name": "메르시",
        "role": "healer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "부활 패시브. 카두세우스 지팡이로 지정 힐.",
        "skill_damages": {
            "skill_1": 3,    # 카두세우스 힐
        },
        "skill_meta": {
            "skill_1": {"name": "카두세우스 지팡이", "cooldown": 0},
        },
    },
    {
        "hero_key": "brigitte",
        "name": "브리기테",
        "role": "healer",
        "hp": 10,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "격려 패시브로 주변 힐. 수리팩으로 거리 무관 힐.",
        "skill_damages": {
            "skill_1": 3,    # 수리팩 (힐)
        },
        "skill_meta": {
            "skill_1": {"name": "수리팩", "cooldown": 0},
        },
        "extra": {"inspire_heal": 1},
    },
    {
        "hero_key": "illari",
        "name": "일리아리",
        "role": "healer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "힐포탑 설치. 태양 소총으로 딜.",
        "skill_damages": {
            "skill_1": 5,    # 태양 소총
        },
        "skill_meta": {
            "skill_1": {"name": "태양 소총", "cooldown": 0},
        },
        "extra": {"turret_hp": 3, "turret_heal": 3},
    },
    {
        "hero_key": "juno",
        "name": "주노",
        "role": "healer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 2,
        "description": "하이퍼링: 배치 시 아군 사거리+1. 펄사어뢰로 세로줄 힐.",
        "skill_damages": {
            "skill_1": 3,    # 펄사어뢰 (힐)
        },
        "skill_meta": {
            "skill_1": {"name": "펄사어뢰", "cooldown": 0},
        },
    },
    {
        "hero_key": "jetpack_cat",
        "name": "제트팩 캣",
        "role": "healer",
        "hp": 6,
        "cost": 1,
        "base_attack": 0,
        "base_defense": 0,
        "base_attack_range": 1,
        "description": "생명줄로 카드 추가 배치. 생체 냥냥탄 힐.",
        "skill_damages": {
            "skill_1": 3,    # 생체 냥냥탄
        },
        "skill_meta": {
            "skill_1": {"name": "생체 냥냥탄", "cooldown": 0},
        },
    },

    # ═══════════════════════════════════════════
    #  즉시 사용 스킬 카드 (cost=1, is_spell=True)
    # ═══════════════════════════════════════════
    {
        "hero_key": "spell_thorn_volley",
        "name": "가시 소나기",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한 세로줄에 있는 모든 적의 스킬을 봉쇄.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "가시 소나기"}},
    },
    {
        "hero_key": "spell_blizzard",
        "name": "눈보라",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한 가로줄의 카드를 얼려서 한턴 스킬 사용 불가.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "눈보라"}},
    },
    {
        "hero_key": "spell_earthshatter",
        "name": "대지분쇄",
        "role": "tank",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "사이드 or 본대 중 한 곳, 모든 적 스킬 봉쇄.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "대지분쇄"}},
    },
    {
        "hero_key": "spell_biotic_grenade",
        "name": "생체 수류탄",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한 영역에 2딜 + 힐밴.",
        "skill_damages": {"skill_1": 2},
        "skill_meta": {"skill_1": {"name": "생체 수류탄"}},
    },
    {
        "hero_key": "spell_rescue",
        "name": "구원의 손길",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "트래시에서 카드 하나를 패로 가져옴.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "구원의 손길"}},
    },
    {
        "hero_key": "spell_sound_barrier",
        "name": "소리방벽",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "모든 아군이 2턴 동안 20 추가체력.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "소리방벽"}},
        "extra": {"extra_hp": 20, "duration": 2},
    },
    {
        "hero_key": "spell_amp_matrix",
        "name": "증폭 매트릭스",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한턴 동안 힐량과 딜량이 2배.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "증폭 매트릭스"}},
    },
    {
        "hero_key": "spell_nano_boost",
        "name": "나노 강화제",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "아군 한명 공격력 +50%, 피해감소 50%. 영구.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "나노 강화제"}},
    },
    {
        "hero_key": "spell_bob",
        "name": "B.O.B",
        "role": "tank",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "탱커 위치에 밥(체력30)을 배치.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "B.O.B"}},
        "extra": {"bob_hp": 30},
    },
    {
        "hero_key": "spell_duplicate",
        "name": "복제",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "상대 카드를 하나 복제해서 내 필드에 배치.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "복제"}},
    },
    {
        "hero_key": "spell_riptire",
        "name": "죽이는 타이어",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한 카드를 지정해서 15 피해. 탱커 제외 거의 원콤.",
        "skill_damages": {"skill_1": 15},
        "skill_meta": {"skill_1": {"name": "죽이는 타이어"}},
    },
    {
        "hero_key": "spell_seismic_slam",
        "name": "지각 충격",
        "role": "tank",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "상대 필드 전체에 5딜.",
        "skill_damages": {"skill_1": 5},
        "skill_meta": {"skill_1": {"name": "지각 충격"}},
    },
    {
        "hero_key": "spell_dragonblade",
        "name": "갈라내는 칼날",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "한 세로줄 전체에 10딜.",
        "skill_damages": {"skill_1": 10},
        "skill_meta": {"skill_1": {"name": "갈라내는 칼날"}},
    },
    {
        "hero_key": "spell_orbital_ray",
        "name": "궤도 광선",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "아군 전체 3힐 + 한턴 공격 +2.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "궤도 광선"}},
        "extra": {"heal": 3, "attack_buff": 2},
    },
    {
        "hero_key": "spell_emp",
        "name": "EMP",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "상대의 설치 스킬을 모두 비활성화.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "EMP"}},
    },

    # ═══════════════════════════════════════════
    #  설치 스킬 카드 (cost=1, is_spell=True)
    # ═══════════════════════════════════════════
    {
        "hero_key": "spell_sleep_dart",
        "name": "수면총",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "상대 카드 한장을 한턴 행동불가.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "수면총"}},
    },
    {
        "hero_key": "spell_immortality_field",
        "name": "불사장치",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "아군에게 부착(숨김). 사망 시 체력 1 보장. 2턴.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "불사장치"}},
    },
    {
        "hero_key": "spell_deflect",
        "name": "튕겨내기",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "아군에게 부착(숨김). 치명적 공격을 반사.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "튕겨내기"}},
    },
    {
        "hero_key": "spell_steel_trap",
        "name": "강철 덫",
        "role": "dealer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "상대 빈칸에 설치. 카드 놓으면 4딜 + 한턴 비활성화.",
        "skill_damages": {"skill_1": 4},
        "skill_meta": {"skill_1": {"name": "강철 덫"}},
    },
    {
        "hero_key": "spell_caduceus_staff",
        "name": "카두세우스 지팡이",
        "role": "healer",
        "hp": 0, "cost": 1, "is_spell": True,
        "base_attack": 0, "base_defense": 0, "base_attack_range": 0,
        "description": "아군에게 부착(보임). 공격력 +3. 영구.",
        "skill_damages": {},
        "skill_meta": {"skill_1": {"name": "카두세우스 지팡이"}},
        "extra": {"attack_bonus": 3},
    },
]


async def seed_cards(db: AsyncSession):
    """카드가 없으면 시드 데이터 삽입."""
    result = await db.execute(select(CardTemplate).limit(1))
    if result.scalar_one_or_none():
        return  # 이미 시드 완료

    for card_data in SEED_CARDS:
        card = CardTemplate(**card_data)
        db.add(card)

    await db.commit()
    print(f"[SEED] {len(SEED_CARDS)} cards inserted.")