import Phaser from 'phaser';

// Bidirectional event bridge between Phaser scenes and HTML overlay UI
export const EventBus = new Phaser.Events.EventEmitter();
