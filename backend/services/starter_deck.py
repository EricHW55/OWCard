from collections import Counter
from random import choices
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import DECK_SIZE
from models.card import CardTemplate
from models.deck import Deck, DeckCard


async def create_random_starter_deck(
    db: AsyncSession,
    player_id: int,
    deck_name: str = "랜덤 스타터 덱",
) -> Deck:
    result = await db.execute(select(CardTemplate.id))
    all_card_ids = list(result.scalars().all())

    if not all_card_ids:
        raise ValueError("No card templates found")

    picked_ids = choices(all_card_ids, k=DECK_SIZE)
    counts = Counter(picked_ids)

    deck = Deck(player_id=player_id, name=deck_name)
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

    return deck