from collections import Counter
# from random import choices
from dataclasses import dataclass
from itertools import cycle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import DECK_SIZE
from models.card import CardTemplate
from models.deck import Deck, DeckCard


# async def create_random_starter_deck(
@dataclass(frozen=True)
class StarterDeckPreset:
    name: str
    role_targets: dict[str, int]


STARTER_DECK_PRESETS: tuple[StarterDeckPreset, ...] = (
    StarterDeckPreset(
        name="스타터 밸런스 덱",
        role_targets={"tank": 6, "dealer": 8, "healer": 4, "spell": 2},
    ),
    StarterDeckPreset(
        name="스타터 돌격 덱",
        role_targets={"tank": 4, "dealer": 10, "healer": 3, "spell": 3},
    ),
    StarterDeckPreset(
        name="스타터 컨트롤 덱",
        role_targets={"tank": 7, "dealer": 6, "healer": 4, "spell": 3},
    ),
)


def _build_fixed_deck_card_counts(
    cards_by_role: dict[str, list[int]],
    role_targets: dict[str, int],
) -> Counter[int]:
    counts: Counter[int] = Counter()
    for role, target_count in role_targets.items():
        ids = cards_by_role.get(role, [])
        if not ids:
            raise ValueError(f"No cards available for role: {role}")
        card_cycle = cycle(ids)
        for _ in range(target_count):
            card_id = next(card_cycle)
            counts[card_id] += 1
    return counts


async def create_fixed_starter_decks(
    db: AsyncSession,
    player_id: int,
    presets: tuple[StarterDeckPreset, ...] = STARTER_DECK_PRESETS,
) -> list[Deck]:
    if not presets:
        raise ValueError("No starter deck presets configured")

    target_total = sum(presets[0].role_targets.values())
    if target_total != DECK_SIZE:
        raise ValueError(f"Starter deck preset size mismatch: {target_total} != {DECK_SIZE}")
    for preset in presets[1:]:
        if sum(preset.role_targets.values()) != DECK_SIZE:
            raise ValueError(f"Starter deck preset size mismatch: {preset.name}")

    result = await db.execute(select(CardTemplate.id, CardTemplate.role, CardTemplate.is_spell))
    card_rows = result.all()
    all_card_ids = [row.id for row in card_rows]

    if not all_card_ids:
        raise ValueError("No card templates found")

    cards_by_role: dict[str, list[int]] = {"tank": [], "dealer": [], "healer": [], "spell": []}
    for row in sorted(card_rows, key=lambda c: c.id):
        role_key = "spell" if row.is_spell else row.role
        if role_key in cards_by_role:
            cards_by_role[role_key].append(row.id)

    created_decks: list[Deck] = []
    for preset in presets:
        counts = _build_fixed_deck_card_counts(cards_by_role, preset.role_targets)
        deck = Deck(player_id=player_id, name=preset.name)
        db.add(deck)
        await db.flush()

        for card_template_id, quantity in counts.items():
            db.add(
                DeckCard(
                    deck_id=deck.id,
                    card_template_id=card_template_id,
                    quantity=quantity,
                )
            )
        created_decks.append(deck)

    return created_decks