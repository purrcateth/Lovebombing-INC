"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { BeatPattern } from "@/lib/types";
import { BeatAudioEngine, createDefaultPattern } from "@/lib/audioEngine";

export interface BeatSequencerHandle {
  play: () => void;
  isPlaying: boolean;
  bpm: number;
  setBpm: (bpm: number) => void;
  activeSection: "drums" | "melody";
  setActiveSection: (s: "drums" | "melody") => void;
  clear: () => void;
  record: () => void;
  isRecording: boolean;
  recordingCountdown: number;
}

interface BeatSequencerProps {
  pattern: BeatPattern;
  onChange: (pattern: BeatPattern) => void;
  readOnly?: boolean;
  hideTransport?: boolean;
}

const CELL_SIZE = 44;
const CELL_GAP = 3;
const GROUP_GAP = 8;
const LABEL_WIDTH = 72;

const TRACK_COLORS: Record<string, string> = {
  kick: "#FF6B9D",
  snare: "#FFD93D",
  hihat: "#6BCB77",
  clap: "#4D96FF",
};

// Melody notes get a gradient from purple to pink
const MELODY_COLORS = [
  "#E8A0FF", "#D88FFF", "#C87EFF", "#B86DFF",
  "#A85CFF", "#9B4BFF", "#8E3AFF", "#8129FF",
];

const MAC_FONT = "'VT323', 'Geneva', monospace";

const BeatSequencer = forwardRef<BeatSequencerHandle, BeatSequencerProps>(
  function BeatSequencer({ pattern, onChange, readOnly, hideTransport }, ref) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(0);
  const [activeSection, setActiveSection] = useState<"drums" | "melody">("drums");
  const engineRef = useRef<BeatAudioEngine | null>(null);
  const recordingCountRef = useRef(0);

  useEffect(() => {
    engineRef.current = new BeatAudioEngine();
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  const toggleCell = useCallback(
    (trackIndex: number, stepIndex: number) => {
      if (readOnly) return;
      const track = pattern.tracks[trackIndex];
      const willBeActive = !track.pattern[stepIndex];

      const newPattern = {
        ...pattern,
        tracks: pattern.tracks.map((t, i) =>
          i === trackIndex
            ? { ...t, pattern: t.pattern.map((v, j) => (j === stepIndex ? !v : v)) }
            : t
        ),
      };
      onChange(newPattern);

      // Preview the sound when activating a cell
      if (willBeActive && engineRef.current) {
        engineRef.current.previewSound(track.instrument, track.volume);
      }
    },
    [pattern, onChange, readOnly]
  );

  const handlePlay = useCallback(() => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      engineRef.current.init();
      engineRef.current.play(pattern, (step) => setCurrentStep(step));
      setIsPlaying(true);
    }
  }, [isPlaying, pattern]);

  const handleBpmChange = useCallback(
    (newBpm: number) => {
      onChange({ ...pattern, bpm: newBpm });
      if (isPlaying && engineRef.current) {
        engineRef.current.setTempo(newBpm);
      }
    },
    [pattern, onChange, isPlaying]
  );

  const handleClear = useCallback(() => {
    const cleared = createDefaultPattern();
    cleared.bpm = pattern.bpm;
    // Preserve any recording tracks
    const recordingTracks = pattern.tracks.filter((t) => t.instrument.startsWith("recording_"));
    recordingTracks.forEach((t) => {
      t.pattern = new Array(pattern.steps).fill(false);
    });
    cleared.tracks = [...cleared.tracks, ...recordingTracks];
    onChange(cleared);
  }, [pattern.bpm, pattern.tracks, pattern.steps, onChange]);

  const handleRecord = useCallback(async () => {
    if (!engineRef.current || readOnly || isRecording) return;
    engineRef.current.init();

    setIsRecording(true);
    setRecordingCountdown(3);

    // Countdown
    for (let i = 3; i > 0; i--) {
      setRecordingCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setRecordingCountdown(0);

    try {
      const buffer = await engineRef.current.recordAudio(2000);
      const recIndex = recordingCountRef.current++;
      const instrumentKey = `recording_${recIndex}`;
      engineRef.current.addRecordingBuffer(instrumentKey, buffer);

      // Add a new track to the pattern
      const newTrack = {
        name: `Rec ${recIndex + 1}`,
        instrument: instrumentKey,
        pattern: new Array(pattern.steps).fill(false),
        volume: 0.8,
      };

      onChange({
        ...pattern,
        tracks: [...pattern.tracks, newTrack],
      });

      // Preview the recording
      engineRef.current.previewSound(instrumentKey, 0.8);
    } catch {
      alert("Could not access microphone. Please allow microphone access.");
    } finally {
      setIsRecording(false);
    }
  }, [readOnly, isRecording, pattern, onChange]);

  // Expose transport controls via imperative handle
  useImperativeHandle(ref, () => ({
    play: handlePlay,
    isPlaying,
    bpm: pattern.bpm,
    setBpm: handleBpmChange,
    activeSection,
    setActiveSection,
    clear: handleClear,
    record: handleRecord,
    isRecording,
    recordingCountdown,
  }), [handlePlay, isPlaying, pattern.bpm, handleBpmChange, activeSection, handleClear, handleRecord, isRecording, recordingCountdown]);

  // Update engine pattern while playing
  useEffect(() => {
    if (isPlaying && engineRef.current) {
      engineRef.current.updatePattern(pattern);
    }
  }, [pattern, isPlaying]);

  // Split tracks into drums, melody, recordings
  const drumTracks = pattern.tracks
    .map((t, i) => ({ track: t, index: i }))
    .filter(({ track }) => !track.instrument.startsWith("melody_") && !track.instrument.startsWith("recording_"));

  const melodyTracks = pattern.tracks
    .map((t, i) => ({ track: t, index: i }))
    .filter(({ track }) => track.instrument.startsWith("melody_"));

  const recordingTracks = pattern.tracks
    .map((t, i) => ({ track: t, index: i }))
    .filter(({ track }) => track.instrument.startsWith("recording_"));

  const visibleTracks = activeSection === "drums"
    ? [...drumTracks, ...recordingTracks]
    : melodyTracks;

  const getTrackColor = (instrument: string, _trackIdx: number): string => {
    if (instrument.startsWith("melody_")) {
      const melodyIdx = melodyTracks.findIndex(({ track }) => track.instrument === instrument);
      return MELODY_COLORS[melodyIdx % MELODY_COLORS.length];
    }
    if (instrument.startsWith("recording_")) {
      return "#FF8C42";
    }
    return TRACK_COLORS[instrument] || "#FF6B9D";
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Transport bar — only shown if not hidden */}
      {!hideTransport && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          background: "#a8c9e3",
          borderBottom: "1px solid #808080",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Play/Stop */}
        <button
          onClick={handlePlay}
          style={{
            width: 32,
            height: 32,
            border: "2px outset #DFDFDF",
            background: isPlaying ? "#FF6B9D" : "#FFD8F6",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            fontFamily: MAC_FONT,
            borderRadius: 0,
          }}
        >
          {isPlaying ? "■" : "▶"}
        </button>

        {/* BPM */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontFamily: MAC_FONT, fontSize: "14px", color: "#000" }}>BPM:</span>
          <input
            type="range"
            min={60}
            max={200}
            value={pattern.bpm}
            onChange={(e) => handleBpmChange(Number(e.target.value))}
            style={{ width: "60px", cursor: "pointer" }}
            disabled={readOnly}
          />
          <span style={{ fontFamily: MAC_FONT, fontSize: "14px", color: "#000", minWidth: "26px" }}>
            {pattern.bpm}
          </span>
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: "2px", marginLeft: "4px" }}>
          <button
            onClick={() => setActiveSection("drums")}
            style={{
              border: "1px solid #808080",
              background: activeSection === "drums" ? "#FFF" : "#FFD8F6",
              fontFamily: MAC_FONT,
              fontSize: "13px",
              padding: "2px 8px",
              cursor: "pointer",
              borderRadius: 0,
              fontWeight: activeSection === "drums" ? "bold" : "normal",
              color: "#000",
            }}
          >
            Drums
          </button>
          <button
            onClick={() => setActiveSection("melody")}
            style={{
              border: "1px solid #808080",
              background: activeSection === "melody" ? "#FFF" : "#E8A0FF",
              fontFamily: MAC_FONT,
              fontSize: "13px",
              padding: "2px 8px",
              cursor: "pointer",
              borderRadius: 0,
              fontWeight: activeSection === "melody" ? "bold" : "normal",
              color: "#000",
            }}
          >
            Melody
          </button>
        </div>

        {/* Clear & Record */}
        {!readOnly && (
          <>
            <button
              onClick={handleClear}
              style={{
                border: "2px outset #DFDFDF",
                background: "#FFD8F6",
                fontFamily: MAC_FONT,
                fontSize: "13px",
                padding: "2px 8px",
                cursor: "pointer",
                borderRadius: 0,
                color: "#000",
              }}
            >
              Clear
            </button>
            <button
              onClick={handleRecord}
              disabled={isRecording}
              style={{
                border: "2px outset #DFDFDF",
                background: isRecording ? "#FF4444" : "#FF8C42",
                fontFamily: MAC_FONT,
                fontSize: "13px",
                padding: "2px 8px",
                cursor: isRecording ? "default" : "pointer",
                borderRadius: 0,
                color: "#FFF",
                animation: isRecording ? "pulse 1s infinite" : "none",
              }}
            >
              {isRecording
                ? recordingCountdown > 0
                  ? `${recordingCountdown}...`
                  : "🎙 REC"
                : "🎙 Record"}
            </button>
          </>
        )}
      </div>
      )}

      {/* Beat grid */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#FFFFFF",
          boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.3), inset -1px -1px 1px rgba(255,255,255,0.5)",
        }}
      >
        <div>
          {/* Step numbers */}
          <div style={{ display: "flex", marginLeft: LABEL_WIDTH + 4 }}>
            {Array.from({ length: pattern.steps }, (_, i) => {
              const groupGap = i > 0 && i % 4 === 0 ? GROUP_GAP : 0;
              return (
                <div
                  key={i}
                  style={{
                    width: CELL_SIZE,
                    marginRight: CELL_GAP,
                    marginLeft: groupGap,
                    textAlign: "center",
                    fontFamily: MAC_FONT,
                    fontSize: "11px",
                    color: "#808080",
                  }}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>

          {/* Track rows */}
          {visibleTracks.map(({ track, index: trackIndex }) => {
            const color = getTrackColor(track.instrument, trackIndex);

            return (
              <div
                key={track.instrument}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: CELL_GAP,
                }}
              >
                {/* Track label */}
                <div
                  style={{
                    width: LABEL_WIDTH,
                    fontFamily: MAC_FONT,
                    fontSize: "13px",
                    color: "#000",
                    textAlign: "right",
                    paddingRight: "6px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {track.name}
                </div>

                {/* Step cells */}
                {track.pattern.map((active, stepIndex) => {
                  const groupGap = stepIndex > 0 && stepIndex % 4 === 0 ? GROUP_GAP : 0;
                  const isCurrentStep = currentStep === stepIndex;

                  return (
                    <button
                      key={stepIndex}
                      onClick={() => toggleCell(trackIndex, stepIndex)}
                      disabled={readOnly}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        marginRight: CELL_GAP,
                        marginLeft: groupGap,
                        border: active ? "2px solid rgba(0,0,0,0.3)" : "1px solid #D0D0D0",
                        borderRadius: 2,
                        background: active
                          ? color
                          : isCurrentStep
                          ? "rgba(0,0,0,0.06)"
                          : "#F0F0F0",
                        cursor: readOnly ? "default" : "pointer",
                        padding: 0,
                        boxShadow: active
                          ? "inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.1)"
                          : "none",
                        opacity: isCurrentStep && !active ? 0.8 : 1,
                        outline: isCurrentStep ? "2px solid #000066" : "none",
                        outlineOffset: -1,
                        transition: "background 0.05s",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default BeatSequencer;
