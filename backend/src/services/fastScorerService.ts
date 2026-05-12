export interface CachedEmail {
    id: string;
    subject: string;
    from: string;
    date: string;
    body: string;
    factors: any;
    classification: any;
    deadline: string | null;
    total_score?: number;
    urgency_label?: string;
    isUnread?: boolean;
}

export interface WeightSettings {
    deadline_weight: number;
    sender_weight: number;
    task_weight: number;
    escalation_weight: number;
}

export function calculateInstantScore(email: CachedEmail, weights: WeightSettings, referenceDate?: Date): CachedEmail {
    const now = referenceDate || new Date();
    const deadline = email.deadline ? new Date(email.deadline) : null;
    
    // 1. Recalculate Deadline Score based on current time
    let rawDeadline = 0;
    let isPastDue = false;

    if (deadline) {
        if (deadline < now) {
            isPastDue = true;
            const diffMs = now.getTime() - deadline.getTime();
            const daysOverdue = diffMs / (1000 * 60 * 60 * 24);
            
            // Align with Python: 1 day = 40, 7 days = 35, then decay to 20
            if (daysOverdue <= 1) rawDeadline = 40.0;
            else if (daysOverdue <= 7) rawDeadline = 35.0;
            else rawDeadline = Math.max(20.0, 30.0 - (daysOverdue - 7) * 0.3);
        } else {
            const diffMs = deadline.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            
            if (diffHours < 24) {
                rawDeadline = 30 + (10 * (1 - (diffHours / 24.0)));
            } else if (diffHours < 168) {
                rawDeadline = 10 + (20 * (1 - ((diffHours - 24) / 144.0)));
            } else if (diffHours < 720) {
                rawDeadline = 2 + (8 * (1 - ((diffHours - 168) / 552.0)));
            } else {
                rawDeadline = 1;
            }
        }
    }

    // 2. Reuse cached raw factors (Sender, Complexity, and Escalation)
    // IMPORTANT: Python service now returns UNWEIGHTED raw scores in these fields
    const rawSenderNorm = (email.factors?.sender?.raw || 0) / 30.0;
    const rawComplexityNorm = (email.factors?.complexity?.raw || 0) / 20.0;
    const rawEscalationNorm = (email.factors?.escalation?.raw || 0) / 10.0;

    const score = (rawDeadline / 40.0 * weights.deadline_weight) + 
                  (rawSenderNorm * weights.sender_weight) + 
                  (rawComplexityNorm * weights.task_weight) + 
                  (rawEscalationNorm * weights.escalation_weight);

    const finalScore = Math.min(100, Math.round(score));

    // 3. Determine Label using the 80/50 thresholds (aligned with Python)
    let label = "Low";
    if (finalScore >= 80) label = "High";
    else if (finalScore >= 50) label = "Medium";
    
    if (isPastDue) label = "Past Due";

    // 4. Update the email object
    // Note: We keep the raw scores UNWEIGHTED in the factors object to avoid feedback loops
    return {
        ...email,
        total_score: finalScore,
        urgency_label: label,
        factors: {
            ...email.factors,
            deadline: { ...email.factors?.deadline, raw: Math.round(rawDeadline) },
            sender: { ...email.factors?.sender, raw: Math.round(email.factors?.sender?.raw || 0) },
            complexity: { ...email.factors?.complexity, raw: Math.round(email.factors?.complexity?.raw || 0) },
            escalation: { ...email.factors?.escalation, raw: Math.round(email.factors?.escalation?.raw || 0) }
        }
    };
}
