"""초기 카드 시드 데이터 (v3) — 사거리 수정 + 누락 카드 추가."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.card import CardTemplate

SEED_CARDS = [
    # ═══════════════════════════════════════════
    #  탱커 (cost=2, base_attack_range=1)
    # ═══════════════════════════════════════════
    {"hero_key":"reinhardt","name":"라인하르트","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"방벽 방패로 아군 보호. 화염강타로 방벽 무시 공격.",
     "skill_damages":{"skill_1":6},"skill_meta":{"skill_1":{"name":"화염강타","cooldown":0}},
     "extra":{"barrier_hp":15}},

    {"hero_key":"winston","name":"윈스턴","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"테슬라 캐논 공격. 방벽 생성기로 아군 보호.",
     "skill_damages":{"skill_1":4},"skill_meta":{"skill_1":{"name":"테슬라 캐논","cooldown":0},"skill_2":{"name":"방벽 생성기","cooldown":0}},
     "extra":{"barrier_hp":5}},

    {"hero_key":"dva","name":"디바","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"메카 파괴 시 송하나. 부스터로 킬캐치. 미사일은 근접할수록 강력.",
     "skill_damages":{"skill_1":6,"skill_2":[8,5,3,1]},
     "skill_meta":{"skill_1":{"name":"부스터","cooldown":0},"skill_2":{"name":"마이크로 미사일","cooldown":0}},
     "extra":{"hana_hp":5}},

    {"hero_key":"zarya","name":"자리야","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"입자 방벽으로 첫 공격 무효화. 피격 시 딜 증가.",
     "skill_damages":{"skill_1":0,"skill_2":5},
     "skill_meta":{"skill_1":{"name":"입자 방벽","cooldown":0},"skill_2":{"name":"입자포","cooldown":0}},
     "extra":{"particle_bonus":3}},

    {"hero_key":"wrecking_ball","name":"레킹볼","role":"tank","hp":25,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"갈고리로 본대/사이드 이동. 파일드라이버 공격.",
     "skill_damages":{"skill_1":6},"skill_meta":{"skill_1":{"name":"파일드라이버","cooldown":0}}},

    {"hero_key":"junkerqueen","name":"정커퀸","role":"tank","hp":22,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"톱니칼로 끌어당기기. 지휘의 외침으로 아군 추가 체력.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"톱니칼","cooldown":0},"skill_2":{"name":"지휘의 외침","cooldown":0}},
     "extra":{"shout_extra_hp":2}},

    {"hero_key":"doomfist","name":"둠피스트","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"로켓 펀치 관통딜. 파워블락으로 피해감소+강화.",
     "skill_damages":{"skill_1":[5,3],"skill_1_empowered":6},
     "skill_meta":{"skill_1":{"name":"로켓 펀치","cooldown":0},"skill_2":{"name":"파워블락","cooldown":0}}},

    {"hero_key":"sigma","name":"시그마","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"실험용 방벽(도발). 초재생으로 복구.",
     "skill_damages":{},
     "skill_meta":{"skill_1":{"name":"실험용 방벽","cooldown":0},"skill_2":{"name":"초재생","cooldown":0}},
     "extra":{"barrier_hp":10,"regen_amount":5}},

    {"hero_key":"ramattra","name":"라마트라","role":"tank","hp":20,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"폼 체인지. 일반=탐식(사거리감소+딜), 네메시스=막기(피해감소).",
     "skill_damages":{"skill_1":2},
     "skill_meta":{"skill_1":{"name":"탐식의 소용돌이","cooldown":0},"skill_2":{"name":"폼 체인지","cooldown":0},"skill_3":{"name":"막기","cooldown":0}},
     "extra":{"nemesis_bonus_hp":10,"block_reduction":50}},

    {"hero_key":"mauga","name":"도미나","role":"tank","hp":22,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"수정 발사로 딜러진 관통 광역. 방벽 배열로 도발.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"수정 발사","cooldown":0},"skill_2":{"name":"방벽 배열","cooldown":0}},
     "extra":{"barrier_hp":4}},

    {"hero_key":"roadhog","name":"로드호그","role":"tank","hp":25,"cost":2,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"갈고리로 적 끌기(아군 거리 무시). 숨돌리기 자힐.",
     "skill_damages":{"skill_1":0,"skill_2":5},
     "skill_meta":{"skill_1":{"name":"갈고리","cooldown":0},"skill_2":{"name":"숨돌리기","cooldown":0}},
     "extra":{"heal_threshold":15}},

    # ═══════════════════════════════════════════
    #  딜러 (cost=1, base_attack_range=1 기본)
    # ═══════════════════════════════════════════
    {"hero_key":"bastion","name":"바스티온","role":"dealer","hp":12,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"강습 10딜(연속불가), 수색 2딜.",
     "skill_damages":{"skill_1":10,"skill_2":2},
     "skill_meta":{"skill_1":{"name":"설정: 강습","cooldown":0},"skill_2":{"name":"설정: 수색","cooldown":0}}},

    {"hero_key":"freja","name":"프레야","role":"dealer","hp":10,"cost":1,
     "base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"상승기류로 에어본 상태 돌입. 에어본 동안 한칸 무시 공격 가능, 대신 피격 사거리 -1. 정조준은 에어본 상태에서만 사용 가능하며 8딜 후 착지.",
     "skill_damages":{"skill_1":0,"skill_2":8},
     "skill_meta":{
        "skill_1":{"name":"상승기류","cooldown":0},
        "skill_2":{"name":"정조준","cooldown":0}
    }},

    {"hero_key":"tracer","name":"트레이서","role":"dealer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"점멸 패시브로 사거리+1. 역행으로 체력 복구.",
     "skill_damages":{"skill_1":5},
     "skill_meta":{"skill_1":{"name":"펄스 쌍권총","cooldown":0},"skill_2":{"name":"역행","cooldown":0}}},

    {"hero_key":"widowmaker","name":"위도우메이커","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":99,
     "description":"명사수. 25% 헤드샷 3배.",
     "skill_damages":{"skill_1":4},
     "skill_meta":{"skill_1":{"name":"죽음의 입맞춤","cooldown":0}}},

    {"hero_key":"hanzo","name":"한조","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":99,
     "description":"명사수. 25% 헤드샷 2배.",
     "skill_damages":{"skill_1":5},
     "skill_meta":{"skill_1":{"name":"폭풍활","cooldown":0}}},

    {"hero_key":"venture","name":"벤처","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"잠복(타겟 제외+한칸 무시, 연속불가). 굴착기 3딜.",
     "skill_damages":{"skill_1":7,"skill_2":3},
     "skill_meta":{"skill_1":{"name":"잠복","cooldown":0},"skill_2":{"name":"스마트 굴착기","cooldown":0}}},

    {"hero_key":"sombra","name":"솜브라","role":"dealer","hp":8,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"기회주의자 패시브. 은신(회피+힐3, 연속불가). 기관단총 5딜.",
     "skill_damages":{"skill_1":5},
     "skill_meta":{"skill_1":{"name":"기관단총","cooldown":0},"skill_2":{"name":"은신","cooldown":0}},
     "extra":{"stealth_heal":3}},

    {"hero_key":"echo","name":"에코","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"점착폭탄(4+4). 광선집중(반피이하 1.5배).",
     "skill_damages":{"skill_1":[4,4],"skill_2":6},
     "skill_meta":{"skill_1":{"name":"점착폭탄","cooldown":0},"skill_2":{"name":"광선집중","cooldown":0}}},

    {"hero_key":"cassidy","name":"캐서디","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":3,
     "description":"난사: 거리별 8/4/2.",
     "skill_damages":{"skill_1":[8,4,2]},
     "skill_meta":{"skill_1":{"name":"난사","cooldown":0}}},

    {"hero_key":"reaper","name":"리퍼","role":"dealer","hp":12,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":3,
     "description":"헬파이어 샷건: 거리별 8/4/1.",
     "skill_damages":{"skill_1":[8,4,1]},
     "skill_meta":{"skill_1":{"name":"헬파이어 샷건","cooldown":0}}},

    {"hero_key":"mei","name":"메이","role":"dealer","hp":15,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"급속 빙결: 사망→얼음→반피 부활. 냉각총 5딜.",
     "skill_damages":{"skill_1":5},
     "skill_meta":{"skill_1":{"name":"냉각총","cooldown":0}}},

    {"hero_key":"ashe","name":"애쉬","role":"dealer","hp":12,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"바이퍼 6딜. 다이너마이트 가로줄 화상.",
     "skill_damages":{"skill_1":6},
     "skill_meta":{"skill_1":{"name":"바이퍼","cooldown":0},"skill_2":{"name":"다이너마이트","cooldown":0}},
     "extra":{"burn_damage":1,"burn_duration":3}},

    {"hero_key":"soldier76","name":"솔져:76","role":"dealer","hp":12,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"생체장(가로줄 힐3, 연속불가). 펄스 소총 6딜.",
     "skill_damages":{"skill_1":3,"skill_2":6},
     "skill_meta":{"skill_1":{"name":"생체장","cooldown":0},"skill_2":{"name":"펄스 소총","cooldown":0}}},

    {"hero_key":"symmetra","name":"시메트라","role":"dealer","hp":12,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"순간이동기. 광자 발사기(차징 2→4→8).",
     "skill_damages":{"skill_2":[2,4,8]},
     "skill_meta":{"skill_1":{"name":"순간이동기","cooldown":0},"skill_2":{"name":"광자 발사기","cooldown":0}}},

    {"hero_key":"torbjorn","name":"토르비욘","role":"dealer","hp":14,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"포탑 설치. 대못 발사기 4딜. 대장간 망치 수리.",
     "skill_damages":{"skill_1":4},
     "skill_meta":{"skill_1":{"name":"대못 발사기","cooldown":0},"skill_2":{"name":"대장간 망치","cooldown":0}},
     "extra":{"turret_hp":5,"turret_damage":2,"repair_amount":3}},

    {"hero_key":"sojourn","name":"소전","role":"dealer","hp":8,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"레일건 2딜+차징. 차징샷 2/5/8.",
     "skill_damages":{"skill_1":2,"skill_2":[2,5,8]},
     "skill_meta":{"skill_1":{"name":"레일건","cooldown":0},"skill_2":{"name":"차징샷","cooldown":0}}},

    {"hero_key":"illari_dealer","name":"엠레","role":"dealer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"사이버 파편 수류탄: 6딜 + 랜덤 바운스 3딜.",
     "skill_damages":{"skill_1":[6,3]},
     "skill_meta":{"skill_1":{"name":"사이버 파편 수류탄","cooldown":0}}},

    # ═══════════════════════════════════════════
    #  힐러 (cost=1, base_attack_range=1 기본)
    # ═══════════════════════════════════════════
    {"hero_key":"ana","name":"아나","role":"healer","hp":7,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"생체 소총: 아군 힐5 / 적 딜3.",
     "skill_damages":{"skill_1":{"heal":5,"damage":3}},
     "skill_meta":{"skill_1":{"name":"생체 소총","cooldown":0}}},

    {"hero_key":"lucio","name":"루시우","role":"healer","hp":8,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"본대=광역힐2, 사이드=이속. 소리파동 사거리-1.",
     "skill_damages":{"skill_1":{"heal":2}},
     "skill_meta":{"skill_1":{"name":"볼륨업","cooldown":0},"skill_2":{"name":"소리 파동","cooldown":0}}},

    {"hero_key":"kiriko","name":"키리코","role":"healer","hp":8,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"본대=힐부적4, 사이드=쿠나이5딜. 순보 패시브.",
     "skill_damages":{"skill_1":{"heal":4,"damage":5}},
     "skill_meta":{"skill_1":{"name":"힐부적/쿠나이","cooldown":0}},
     "extra":{"swift_step_threshold":4}},

    {"hero_key":"moira","name":"모이라","role":"healer","hp":7,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"생체 구슬 2딜→충전→생체 손아귀 세로줄 5힐.",
     "skill_damages":{"skill_1":5,"skill_2":2},
     "skill_meta":{"skill_1":{"name":"생체 손아귀","cooldown":0},"skill_2":{"name":"생체 구슬","cooldown":0}}},

    {"hero_key":"zenyatta","name":"젠야타","role":"healer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"부조화(받는 딜+2). 조화 단일 3힐.",
     "skill_damages":{"skill_2":3},
     "skill_meta":{"skill_1":{"name":"부조화","cooldown":0},"skill_2":{"name":"조화","cooldown":0}},
     "extra":{"discord_value":2}},

    {"hero_key":"lifeweaver","name":"우양","role":"healer","hp":7,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"수호의 파도(아군 힐증, 적 넉백). 회복의 물결 3힐.",
     "skill_damages":{"skill_2":3},
     "skill_meta":{"skill_1":{"name":"수호의 파도","cooldown":0},"skill_2":{"name":"회복의 물결","cooldown":0}},
     "extra":{"heal_amplify":2,"knockback_value":1}},

    {"hero_key":"mizuki","name":"미즈키","role":"healer","hp":7,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"속박사슬(사이드 봉쇄). 치유의 삿갓(랜덤 5힐).",
     "skill_damages":{},
     "skill_meta":{"skill_1":{"name":"속박사슬","cooldown":0},"skill_2":{"name":"치유의 삿갓","cooldown":0}},
     "extra":{"kasa_total_heal":5}},

    {"hero_key":"baptiste","name":"바티스트","role":"healer","hp":8,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"생체탄 발사기 가로줄 3힐. 공격 3딜.",
     "skill_damages":{"skill_1":3,"skill_2":3},
     "skill_meta":{"skill_1":{"name":"생체탄 발사기","cooldown":0},"skill_2":{"name":"공격","cooldown":0}}},

    {"hero_key":"mercy","name":"메르시","role":"healer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"부활 패시브. 카두세우스 지팡이 3힐.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"카두세우스 지팡이","cooldown":0}}},

    {"hero_key":"brigitte","name":"브리기테","role":"healer","hp":10,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"격려 패시브(매턴 아군 1힐). 수리팩 거리무관 3힐.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"수리팩","cooldown":0}},
     "extra":{"inspire_heal":1}},

    {"hero_key":"illari","name":"일리아리","role":"healer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"힐포탑 패시브. 태양 소총 5딜.",
     "skill_damages":{"skill_1":5},
     "skill_meta":{"skill_1":{"name":"태양 소총","cooldown":0}},
     "extra":{"turret_hp":3,"turret_heal":3}},

    {"hero_key":"juno","name":"주노","role":"healer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"하이퍼링(배치 시 아군 사거리+1). 펄사어뢰 세로줄 3힐.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"펄사어뢰","cooldown":0}}},

    {"hero_key":"jetpack_cat","name":"제트팩 캣","role":"healer","hp":6,"cost":1,"base_attack":0,"base_defense":0,"base_attack_range":1,
     "description":"생명줄 패시브. 생체 냥냥탄 3힐.",
     "skill_damages":{"skill_1":3},
     "skill_meta":{"skill_1":{"name":"생체 냥냥탄","cooldown":0}}},

    # ═══════════════════════════════════════════
    #  즉시 스킬 카드
    # ═══════════════════════════════════════════
    {"hero_key":"spell_thorn_volley","name":"가시 소나기","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"한 세로줄 적 스킬 봉쇄.","skill_damages":{},"skill_meta":{"skill_1":{"name":"가시 소나기"}}},
    {"hero_key":"spell_blizzard","name":"눈보라","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"한 가로줄 얼려서 한턴 스킬 불가.","skill_damages":{},"skill_meta":{"skill_1":{"name":"눈보라"}}},
    {"hero_key":"spell_earthshatter","name":"대지분쇄","role":"tank","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"사이드 or 본대 모든 적 스킬 봉쇄.","skill_damages":{},"skill_meta":{"skill_1":{"name":"대지분쇄"}}},
    {"hero_key":"spell_biotic_grenade","name":"생체 수류탄","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"한 영역 2딜 + 힐밴.","skill_damages":{"skill_1":2},"skill_meta":{"skill_1":{"name":"생체 수류탄"}}},
    {"hero_key":"spell_rescue","name":"구원의 손길","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"트래시에서 카드 1장 패로.","skill_damages":{},"skill_meta":{"skill_1":{"name":"구원의 손길"}}},
    {"hero_key":"spell_sound_barrier","name":"소리방벽","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군 전체 2턴 +20 추가체력.","skill_damages":{},"skill_meta":{"skill_1":{"name":"소리방벽"}},"extra":{"extra_hp":20,"duration":2}},
    {"hero_key":"spell_amp_matrix","name":"증폭 매트릭스","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"한턴 딜/힐 2배.","skill_damages":{},"skill_meta":{"skill_1":{"name":"증폭 매트릭스"}}},
    {"hero_key":"spell_nano_boost","name":"나노 강화제","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군 1명 공격+50%, 피해감소50%. 영구.","skill_damages":{},"skill_meta":{"skill_1":{"name":"나노 강화제"}}},
    {"hero_key":"spell_bob","name":"B.O.B","role":"tank","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"탱커 위치에 밥(HP30) 배치.","skill_damages":{},"skill_meta":{"skill_1":{"name":"B.O.B"}},"extra":{"bob_hp":30}},
    {"hero_key":"spell_duplicate","name":"복제","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"상대 카드 복제해서 내 필드에.","skill_damages":{},"skill_meta":{"skill_1":{"name":"복제"}}},
    {"hero_key":"spell_riptire","name":"죽이는 타이어","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"단일 15딜.","skill_damages":{"skill_1":15},"skill_meta":{"skill_1":{"name":"죽이는 타이어"}}},
    {"hero_key":"spell_seismic_slam","name":"지각 충격","role":"tank","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"상대 전체 5딜.","skill_damages":{"skill_1":5},"skill_meta":{"skill_1":{"name":"지각 충격"}}},
    {"hero_key":"spell_dragonblade","name":"갈라내는 칼날","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"한 세로줄 전체 10딜.","skill_damages":{"skill_1":10},"skill_meta":{"skill_1":{"name":"갈라내는 칼날"}}},
    {"hero_key":"spell_orbital_ray","name":"궤도 광선","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군 전체 3힐 + 한턴 공격+2.","skill_damages":{},"skill_meta":{"skill_1":{"name":"궤도 광선"}},"extra":{"heal":3,"attack_buff":2}},
    {"hero_key":"spell_emp","name":"EMP","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"상대 설치 스킬 모두 비활성화.","skill_damages":{},"skill_meta":{"skill_1":{"name":"EMP"}}},
    {"hero_key":"spell_maximilian","name":"막시밀리앙","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"덱에서 원하는 카드 1장을 패로 가져옴.","skill_damages":{},"skill_meta":{"skill_1":{"name":"막시밀리앙"}}},

    # ═══════════════════════════════════════════
    #  설치 스킬 카드
    # ═══════════════════════════════════════════
    {"hero_key":"spell_sleep_dart","name":"수면총","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"상대 1장 한턴 행동불가.","skill_damages":{},"skill_meta":{"skill_1":{"name":"수면총"}}},
    {"hero_key":"spell_immortality_field","name":"불사장치","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군에 부착(숨김). 사망 시 HP1 보장. 2턴.","skill_damages":{},"skill_meta":{"skill_1":{"name":"불사장치"}}},
    {"hero_key":"spell_deflect","name":"튕겨내기","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군에 부착(숨김). 치명적 공격 반사.","skill_damages":{},"skill_meta":{"skill_1":{"name":"튕겨내기"}}},
    {"hero_key":"spell_steel_trap","name":"강철 덫","role":"dealer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"상대 빈칸 설치. 배치 시 4딜+비활성화.","skill_damages":{"skill_1":4},"skill_meta":{"skill_1":{"name":"강철 덫"}}},
    {"hero_key":"spell_caduceus_staff","name":"카두세우스 지팡이","role":"healer","hp":0,"cost":1,"is_spell":True,"base_attack":0,"base_defense":0,"base_attack_range":0,
     "description":"아군에 부착(보임). 공격력+3. 영구.","skill_damages":{},"skill_meta":{"skill_1":{"name":"카두세우스 지팡이"}},"extra":{"attack_bonus":3}},
]


async def seed_cards(db: AsyncSession):
    result = await db.execute(select(CardTemplate).limit(1))
    if result.scalar_one_or_none():
        return
    for card_data in SEED_CARDS:
        db.add(CardTemplate(**card_data))
    await db.commit()
    print(f"[SEED] {len(SEED_CARDS)} cards inserted.")