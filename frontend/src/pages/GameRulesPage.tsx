import React from 'react';
import { useNavigate } from 'react-router-dom';
import './GameRulesPage.css';

const GameRulesPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="rules-page">
            <div className="rules-card">
                <h1>게임 규칙 (임시)</h1>
                <p>
                    추후 이 페이지에 게임 규칙을 직접 작성하거나,
                    외부 노션 링크로 연결할 예정입니다.
                </p>

                <div className="rules-actions">
                    <button onClick={() => navigate('/')}>로비로 돌아가기</button>
                    <a href="https://resonant-whimsey-1f2.notion.site/32305264b19480a09c34daab4004eded" target="_blank" rel="noreferrer">
                        노션 연결(임시)
                    </a>
                </div>
            </div>
        </div>
    );
};

export default GameRulesPage;