'use strict';

const { EventEmitter } = require('events');

/**
 * ResourcesManager handles game manual analysis, rule quizzes,
 * and management of team resources/links.
 */
class ResourcesManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
  }

  /**
   * Mock AI analysis of game manual for loopholes and strategy.
   */
  async analyzeManual(query) {
    const normalizedQuery = String(query || '').toLowerCase();
    const blockedSeasons = ['into the deep', 'centerstage', 'powerplay', 'freight frenzy', '2023', '2024'];
    if (blockedSeasons.some(term => normalizedQuery.includes(term))) {
      return 'I can only answer from the DECODE 2025-2026 manual. Please ask a DECODE-specific question.';
    }

    const responses = {
      'loophole': 'DECODE manual insight: focus on legal pre-load and cycle timing windows in Section 4 to maximize scoring without incurring possession penalties.',
      'strategy': 'DECODE strategy baseline: prioritize reliable autonomous cycles, then preserve endgame consistency over risky late-match routes.',
      'difference': 'I only compare rule interpretations within DECODE 2025-2026. Ask about autonomous, teleop, penalties, or endgame details.'
    };

    const key = Object.keys(responses).find(k => normalizedQuery.includes(k)) || 'general';
    return responses[key] || 'Based on DECODE 2025-2026, review scoring and robot constraints in Section 4 before finalizing your design.';
  }

  /**
   * Generates a random rule quiz question.
   */
  getQuizQuestion() {
    const questions = [
      {
        q: "What is the maximum expansion limit in the Submersible?",
        options: ["14 inches", "20 inches", "No limit", "Expansion is prohibited"],
        correct: 1
      },
      {
        q: "How many points is a 'Major Penalty' worth this season?",
        options: ["10 points", "20 points", "30 points", "Disqualification"],
        correct: 2
      },
      {
        q: "Can a robot possess more than one 'Specimen' at a time?",
        options: ["Yes, up to two", "No, only one", "Only if one is being scored", "Yes, if they are different colors"],
        correct: 1
      }
    ];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  /**
   * Persists a team resource link.
   */
  saveLink(label, url) {
    const links = this.store.get('resources.links') || [];
    links.push({ label, url, id: Date.now() });
    this.store.set('resources.links', links);
    return links;
  }

  getLinks() {
    return this.store.get('resources.links') || [
      { label: "Opera Pinboard", url: "https://www.opera.com/pinboard", id: 1 },
      { label: "Team Google Drive", url: "https://drive.google.com", id: 2 }
    ];
  }

  deleteLink(id) {
    const links = this.store.get('resources.links') || [];
    const filtered = links.filter(l => l.id !== id);
    this.store.set('resources.links', filtered);
    return filtered;
  }
}

module.exports = ResourcesManager;
