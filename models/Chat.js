import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system', 'tool'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  tokens: {
    prompt: { type: Number, default: 0 },
    completion: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'pdf', 'txt', 'code', 'audio', 'video'],
      required: true
    },
    url: String,
    name: String,
    size: Number,
    preview: String
  }],
  tools: [{
    name: String,
    input: Map,
    output: Map,
    success: Boolean
  }],
  sentiment: {
    score: Number,
    label: String,
    confidence: Number
  },
  cost: {
    type: Number,
    default: 0
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

const chatSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 500
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  messages: [messageSchema],
  settings: {
    provider: {
      type: String,
      enum: ['openai', 'anthropic', 'cohere', 'huggingface', 'local'],
      default: 'openai'
    },
    model: {
      type: String,
      default: 'gpt-3.5-turbo'
    },
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 2
    },
    maxTokens: {
      type: Number,
      default: 2000
    },
    topP: {
      type: Number,
      default: 1
    },
    frequencyPenalty: {
      type: Number,
      default: 0
    },
    presencePenalty: {
      type: Number,
      default: 0
    },
    systemPrompt: {
      type: String,
      default: 'You are a helpful AI assistant.'
    },
    tools: [{
      name: String,
      enabled: Boolean,
      config: Map
    }]
  },
  // Advanced features
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    index: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  labels: [{
    name: String,
    color: String
  }],
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['viewer', 'editor', 'commenter'],
      default: 'viewer'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Status and visibility
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'draft'],
    default: 'active'
  },
  visibility: {
    type: String,
    enum: ['private', 'shared', 'public', 'unlisted'],
    default: 'private'
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true
  },
  // Analytics
  analytics: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    userSatisfaction: { type: Number, default: 0 }
  },
  // Security
  encryption: {
    enabled: { type: Boolean, default: false },
    algorithm: String,
    keyVersion: Number
  },
  // Cost tracking
  costTracking: {
    totalCost: { type: Number, default: 0 },
    costBreakdown: Map,
    budget: Number,
    budgetAlert: Boolean
  },
  // Performance
  tokenCount: {
    prompt: { type: Number, default: 0 },
    completion: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  messageCount: {
    user: { type: Number, default: 0 },
    assistant: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for performance
chatSchema.index({ userId: 1, status: 1, lastMessageAt: -1 });
chatSchema.index({ visibility: 1, createdAt: -1 });
chatSchema.index({ tags: 1, status: 1 });
chatSchema.index({ 'participants.userId': 1 });
chatSchema.index({ shareToken: 1 }, { sparse: true });

// Virtuals
chatSchema.virtual('lastMessage').get(function() {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
});

chatSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

chatSchema.virtual('isShared').get(function() {
  return this.visibility !== 'private';
});

// Pre-save middleware
chatSchema.pre('save', function(next) {
  // Update token counts
  this.tokenCount.prompt = this.messages.reduce((sum, msg) => sum + (msg.tokens.prompt || 0), 0);
  this.tokenCount.completion = this.messages.reduce((sum, msg) => sum + (msg.tokens.completion || 0), 0);
  this.tokenCount.total = this.tokenCount.prompt + this.tokenCount.completion;

  // Update message counts
  this.messageCount.user = this.messages.filter(msg => msg.role === 'user').length;
  this.messageCount.assistant = this.messages.filter(msg => msg.role === 'assistant').length;
  this.messageCount.total = this.messages.length;

  // Update last message timestamp
  if (this.messages.length > 0) {
    this.lastMessageAt = this.messages[this.messages.length - 1].createdAt;
  }

  // Generate share token if needed
  if (this.visibility !== 'private' && !this.shareToken) {
    this.shareToken = require('crypto').randomBytes(16).toString('hex');
  }

  next();
});

// Instance methods
chatSchema.methods.addMessage = function(messageData) {
  const message = {
    ...messageData,
    id: uuidv4(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  this.messages.push(message);

  // Auto-generate title from first user message
  if (this.messages.length === 1 && messageData.role === 'user') {
    this.title = this.generateTitle(messageData.content);
  }

  return this.messages[this.messages.length - 1];
};

chatSchema.methods.generateTitle = function(content) {
  const cleanContent = content.replace(/[^\w\s]/gi, '');
  const words = cleanContent.split(/\s+/).slice(0, 8);
  return words.join(' ') + (cleanContent.length > 50 ? '...' : '');
};

chatSchema.methods.addParticipant = function(userId, role = 'viewer') {
  const existing = this.participants.find(p => p.userId.toString() === userId.toString());
  
  if (existing) {
    existing.role = role;
  } else {
    this.participants.push({
      userId,
      role,
      joinedAt: new Date()
    });
  }
  
  return this;
};

chatSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.userId.toString() !== userId.toString());
  return this;
};

chatSchema.methods.canEdit = function(userId) {
  if (this.userId.toString() === userId.toString()) return true;
  
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  return participant && participant.role === 'editor';
};

chatSchema.methods.canView = function(userId) {
  if (this.visibility === 'public') return true;
  if (this.userId.toString() === userId.toString()) return true;
  
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  return !!participant;
};

chatSchema.methods.export = function(format = 'json') {
  switch (format) {
    case 'json':
      return {
        title: this.title,
        description: this.description,
        messages: this.messages,
        settings: this.settings,
        metadata: {
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
          messageCount: this.messageCount,
          tokenCount: this.tokenCount
        }
      };
    case 'markdown':
      return this.messages.map(msg => 
        `## ${msg.role}\n${msg.content}\n\n---\n`
      ).join('\n');
    case 'csv':
      // Implement CSV export
      break;
    default:
      return this.toObject();
  }
};

// Static methods
chatSchema.statics.getUserChats = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    status = 'active',
    search = '',
    sortBy = 'lastMessageAt',
    sortOrder = 'desc'
  } = options;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  let query = { 
    $or: [
      { userId },
      { 'participants.userId': userId }
    ],
    status 
  };

  if (search) {
    query.$and = [
      query.$and || {},
      {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } }
        ]
      }
    ];
  }

  return this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select('-messages')
    .populate('participants.userId', 'username avatar')
    .lean();
};

chatSchema.statics.getPublicChats = function(options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  let query = { 
    visibility: 'public',
    status: 'active'
  };

  if (search) {
    query.$and = [
      query.$and || {},
      {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } }
        ]
      }
    ];
  }

  return this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select('title description settings tags analytics participantCount createdAt')
    .populate('userId', 'username avatar')
    .lean();
};

// Plugins
chatSchema.plugin(require('mongoose-autopopulate'));
chatSchema.plugin(require('mongoose-paginate-v2'));

export default mongoose.model('Chat', chatSchema);
