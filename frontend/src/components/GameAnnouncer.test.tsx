import React from 'react';
import { render } from '@testing-library/react';
import GameAnnouncer from './GameAnnouncer';

jest.mock('../utils/soundManager', () => ({
    soundManager: {
        playCardVoice: jest.fn(),
    },
}));

describe('GameAnnouncer', () => {
    test('renders skill announcer snapshot', () => {
        const { container } = render(
            <GameAnnouncer
                data={{
                    type: 'skill',
                    title: '비상 치료',
                    subtitle: '메르시 사용',
                    description: '아군을 회복합니다.',
                    heroKey: 'mercy',
                    imageName: '메르시',
                    isSpell: false,
                    duration: 1200,
                }}
                onClose={() => {}}
            />,
        );

        expect(container.querySelector('.skill-card-title')?.textContent).toMatchInlineSnapshot(`"비상 치료"`);
    });
});