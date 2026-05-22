export interface CachedEmail {
    id: string;
    subject: string;
    from: string;
    date: string;
    body: string;
    sender_name?: string;
    factors: any;
    classification: any;
    deadline: string | null;
    total_score?: number;
    urgency_label?: string;
    explanation?: string;
    isUnread?: boolean;
    scoring_version?: string;
}

export interface ScoringSettings {
    weights: {
        deadline_weight: number;
        sender_weight: number;
        task_weight: number;
        escalation_weight: number;
    };
    important_senders: string[];
}

function calculateBaseSenderScore(senderEmail = '', senderName = '') {
    const senderLower = senderEmail.toLowerCase();
    const nameLower = senderName.toLowerCase();
    const highTitles = ['ceo', 'president', 'chairman', 'founder', 'manager', 'director', 'vp', 'chief', 'lead', 'head'];

    const matchedTitle = highTitles.find(title => nameLower.includes(title) || senderLower.includes(title));
    if (matchedTitle) {
        return { raw: 30, reason: `sender holds a high-authority title (${matchedTitle})` };
    }

    if (senderLower.includes('.gov')) return { raw: 25, reason: 'sender is from a government domain' };
    if (senderLower.includes('.edu')) return { raw: 15, reason: 'sender is from an educational domain' };

    if (senderLower.includes('@')) {
        const domain = senderLower.split('@').pop() || '';
        if (!['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)) {
            return { raw: 15, reason: 'sender is from a corporate or custom domain' };
        }
        return { raw: 3, reason: 'sender is from a public email domain' };
    }

    return { raw: 0, reason: undefined };
}

export function calculateInstantScore(email: CachedEmail, settings: ScoringSettings, referenceDate?: Date): CachedEmail {   
    const now = referenceDate || new Date();
    const deadline = email.deadline ? new Date(email.deadline) : null;
    const weights = settings.weights;
    const importantSenders = settings.important_senders || [];

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
                rawDeadline = 15 + (15 * (1 - ((diffHours - 24) / 144.0)));
            } else if (diffHours < 720) {
                // More aggressive mid-range: 5 to 15 points
                rawDeadline = 5 + (10 * (1 - ((diffHours - 168) / 552.0)));
            } else {
                rawDeadline = 2;
            }
        }
    }

    // 2. Sender Score with VIP boost
    const baseSender = calculateBaseSenderScore(email.from, email.sender_name);
    let rawSender = baseSender.raw;
    let senderReason = baseSender.reason;
    const senderLower = (email.from || '').toLowerCase();     

    const matchedVip = importantSenders.find(vip => vip && senderLower.includes(vip.toLowerCase()));
    if (matchedVip) {
        rawSender = 30; // Max sender score
        senderReason = `sender '${matchedVip}' is on your important senders list`;
    }

    // 3. Calculate Weighted Contributions using (UserWeight / StandardBaseline)
    const BASELINE_DEADLINE = 40.0;
    const BASELINE_SENDER = 30.0;
    const BASELINE_COMPLEXITY = 20.0;
    const BASELINE_ESCALATION = 10.0;

    // Use the ORIGINAL AI RAW scores for the calculation     
    // This prevents the "feedback loop" bug
    const aiRawDeadline = rawDeadline;
    const aiRawSender = rawSender;
    const aiRawComplexity = email.factors?.complexity?.raw || 4; // Default to low if missing
    const aiRawEscalation = email.factors?.escalation?.raw || 0;

    const deadlinePoints = Math.round((aiRawDeadline / BASELINE_DEADLINE) * weights.deadline_weight);
    const senderPoints = Math.round((aiRawSender / BASELINE_SENDER) * weights.sender_weight);
    const complexityPoints = Math.round((aiRawComplexity / BASELINE_COMPLEXITY) * weights.task_weight);
    const escalationPoints = Math.round((aiRawEscalation / BASELINE_ESCALATION) * weights.escalation_weight);

    // Final total is sum of weighted points
    const finalScore = Math.min(100, deadlinePoints + senderPoints + complexityPoints + escalationPoints);

    // 4. Determine Label using the 80/50 thresholds (aligned with Python)
    let label = "Low";
    if (finalScore >= 80) label = "High";
    else if (finalScore >= 50) label = "Medium";

    if (isPastDue) label = "Past Due";

    // 5. Build Factors for UI and Cache
    const reasons: string[] = [];
    const factors: any = {
        deadline: {
            ...email.factors?.deadline,
            raw: Math.round(aiRawDeadline * 10) / 10,
            weighted: Math.round(deadlinePoints),
            max: BASELINE_DEADLINE,
            evidence: email.factors?.deadline?.evidence       
        },
        sender: {
            ...email.factors?.sender,
            raw: Math.round(aiRawSender * 10) / 10,
            weighted: Math.round(senderPoints),
            reason: senderReason,
            max: BASELINE_SENDER
        },
        complexity: {
            ...email.factors?.complexity,
            raw: Math.round(aiRawComplexity * 10) / 10,
            weighted: Math.round(complexityPoints),
            reason: email.factors?.complexity?.reason,        
            max: BASELINE_COMPLEXITY
        },
        escalation: {
            ...email.factors?.escalation,
            raw: Math.round(aiRawEscalation * 10) / 10,
            weighted: Math.round(escalationPoints),
            evidence: email.factors?.escalation?.evidence,    
            max: BASELINE_ESCALATION
        }
    };

    if (factors.escalation.raw > 0 && factors.escalation.evidence) {
        reasons.push(`urgent escalation keyword '${factors.escalation.evidence}' was detected`);
    }
    if (factors.sender.reason) {
        reasons.push(factors.sender.reason);
    }
    if (factors.deadline.evidence) {
        reasons.push(`an imminent deadline '${factors.deadline.evidence}' was identified`);
    }
    if (factors.complexity.reason) {
        reasons.push(factors.complexity.reason);
    }

    let explanation = "This message was reviewed and ranked based on standard priority metrics.";
    const validReasons = reasons.filter(r => r && typeof r === 'string' && r.length > 0);

    if (validReasons.length === 1) {
        explanation = `This message was prioritized because ${validReasons[0]}.`;
    } else if (validReasons.length > 1) {
        const last = validReasons.pop();
        explanation = `This message was prioritized because ${validReasons.join(', ')}, and ${last}.`;
    }

    // 6. Update the email object
    return {
        ...email,
        total_score: isNaN(finalScore) ? 0 : finalScore,      
        urgency_label: label,
        explanation,
        factors
    };
}
