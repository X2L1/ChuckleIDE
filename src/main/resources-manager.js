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
    // In a real implementation, this would use an LLM with RAG on the Game Manual PDF.
    const responses = {
      'loophole': "AI Analysis: The scoring transition between the Submersible and the Observation Zone has a 2-second grace period for valid Sample placement. Teams can exploit this by 'flicking' Samples just before the End Game buzzer.",
      'strategy': "Initial Strategy: Prioritize high-basket scoring in Auto. Reliable 4-sample Auto routines currently yield higher point-per-second ratios than trying to hang early.",
      'difference': "Key Difference from CENTERSTAGE: The 'specimen' scoring mechanic replaces the pixel stacking. Precision in attachment is now more valuable than bulk volume."
    };

    const key = Object.keys(responses).find(k => query.toLowerCase().includes(k)) || 'general';
    return responses[key] || "I've analyzed the current game manual. Focus on Section 4.5 for specific scoring constraints on vertical expansion.";
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
