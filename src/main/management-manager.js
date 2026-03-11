'use strict';

const { EventEmitter } = require('events');

/**
 * ManagementManager handles team tasks, member profiles, and AI-driven assignments.
 */
class ManagementManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
  }

  /**
   * Get all tasks.
   */
  getTasks() {
    return this.store.get('management.tasks', [
      { id: 1, title: 'Finish Drivetrain CAD', status: 'todo', memberId: null, priority: 'High' },
      { id: 2, title: 'Write Autonomous PID', status: 'in-progress', memberId: 101, priority: 'Medium' },
      { id: 3, title: 'Order Slim Batts', status: 'done', memberId: 102, priority: 'Low' }
    ]);
  }

  /**
   * Save or update a task.
   */
  saveTask(task) {
    const tasks = this.getTasks();
    const index = tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
      tasks[index] = task;
    } else {
      task.id = Date.now();
      tasks.push(task);
    }
    this.store.set('management.tasks', tasks);
    return task;
  }

  /**
   * Delete a task.
   */
  deleteTask(id) {
    const tasks = this.getTasks().filter(t => t.id !== id);
    this.store.set('management.tasks', tasks);
  }

  /**
   * Get team members.
   */
  getTeam() {
    return this.store.get('management.team', [
      { id: 101, name: 'Xavier', role: 'Lead Coder', skills: ['Java', 'PID', 'Vuforia'], load: 2 },
      { id: 102, name: 'Ava', role: 'Mechanical', skills: ['CAD', 'Assembly', '3D Printing'], load: 1 },
      { id: 103, name: 'Julian', role: 'Outreach', skills: ['Writing', 'Graphic Design'], load: 0 }
    ]);
  }

  /**
   * AI-driven task assignment suggestion.
   */
  getAiAssignmentSuggestion(taskId) {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;

    const team = this.getTeam();
    // Simple logic: match task keywords with member skills and consider load
    const lowerTitle = task.title.toLowerCase();
    
    let bestMember = null;
    let maxMatches = -1;

    for (const member of team) {
      let matches = 0;
      for (const skill of member.skills) {
        if (lowerTitle.includes(skill.toLowerCase())) matches++;
      }
      
      // Weight less load higher if matches are equal
      if (matches > maxMatches || (matches === maxMatches && member.load < (bestMember ? bestMember.load : Infinity))) {
        maxMatches = matches;
        bestMember = member;
      }
    }

    return {
      taskId: task.id,
      memberId: bestMember ? bestMember.id : null,
      memberName: bestMember ? bestMember.name : 'Unassigned',
      reason: maxMatches > 0 ? `Matches skills: ${bestMember.skills.join(', ')}` : 'Lowest current workload'
    };
  }

  /**
   * Outreach log methods.
   */
  getOutreachLog() {
    return this.store.get('outreach.log', [
      { id: 1, event: 'Elementary STEM Fair', date: '2025-10-12', impact: '50 students', hours: 4 },
      { id: 2, event: 'Library Demo', date: '2025-11-05', impact: '20 people', hours: 2 }
    ]);
  }

  addOutreachEntry(entry) {
    const log = this.getOutreachLog();
    entry.id = Date.now();
    log.push(entry);
    this.store.set('outreach.log', log);
    return entry;
  }
}

module.exports = ManagementManager;
