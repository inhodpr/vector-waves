import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

interface MarkerLabelProps {
    markerId: string;
    name: string;
}

export const MarkerLabel: React.FC<MarkerLabelProps> = ({ markerId, name }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localName, setLocalName] = useState(name);
    const updateMarkerName = useAppStore(state => state.updateAudioMarkerName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLocalName(name);
    }, [name]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleCommit = () => {
        if (localName.trim() !== '') {
            updateMarkerName(markerId, localName);
        } else {
            setLocalName(name); // Reset if empty
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCommit();
        } else if (e.key === 'Escape') {
            setLocalName(name);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()} // Prevent timeline seeking
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '-24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '60px',
                    fontSize: '10px',
                    padding: '2px 4px',
                    border: '1px solid #2196F3',
                    borderRadius: '2px',
                    zIndex: 30,
                    outline: 'none',
                    backgroundColor: '#FFF'
                }}
            />
        );
    }

    return (
        <div
            onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            title={name} // Tooltip for discoverability
            style={{
                position: 'absolute',
                top: '-20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFF00',
                color: '#000',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                cursor: 'text',
                userSelect: 'none',
                zIndex: 25,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                maxWidth: '80px',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }}
        >
            {name}
        </div>
    );
};
