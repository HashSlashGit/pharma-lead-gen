import mongoose, { Schema, Document, Model } from 'mongoose';
import type { EncryptedField } from '@/lib/utils/encryption';

export interface IIntegrationSettings extends Document {
  // Claude AI
  claudeApiKey?: EncryptedField;

  // Smartlead email sending
  smartleadApiKey?: EncryptedField;
  smartleadCampaignId?: string;
  smartleadFromEmail?: string;
  smartleadFromName?: string;
  smartleadDryRun?: boolean;


  // Apollo B2B contacts
  apolloApiKey?: EncryptedField;
  apolloMaxResults?: number;

  // Apify Google Maps
  apifyToken?: EncryptedField;
  apifyActorId?: string;
  apifyMaxResults?: number;
  apifyWebsiteEnrichment?: boolean;

  // Mailbox IMAP sync
  mailboxEnabled?: boolean;
  mailboxImapHost?: string;
  mailboxImapPort?: number;
  mailboxImapSecure?: boolean;
  mailboxUser?: string;
  mailboxPassword?: EncryptedField;
  mailboxLookbackDays?: number;

  // App
  appUrl?: string;

  // Google OAuth (Gmail sync)
  googleClientId?: EncryptedField;
  googleClientSecret?: EncryptedField;
  googleRedirectUri?: string;

  updatedAt: Date;
  createdAt: Date;
}

const EncryptedFieldSchema = new Schema<EncryptedField>(
  { ct: String, iv: String, tag: String },
  { _id: false }
);

const IntegrationSettingsSchema = new Schema<IIntegrationSettings>(
  {
    claudeApiKey:         EncryptedFieldSchema,
    smartleadApiKey:      EncryptedFieldSchema,
    smartleadCampaignId:  { type: String },
    smartleadFromEmail:   { type: String },
    smartleadFromName:    { type: String },
    smartleadDryRun:          { type: Boolean },
    apolloApiKey:         EncryptedFieldSchema,
    apolloMaxResults:     { type: Number },
    apifyToken:           EncryptedFieldSchema,
    apifyActorId:         { type: String },
    apifyMaxResults:      { type: Number },
    apifyWebsiteEnrichment: { type: Boolean },
    mailboxEnabled:       { type: Boolean },
    mailboxImapHost:      { type: String },
    mailboxImapPort:      { type: Number },
    mailboxImapSecure:    { type: Boolean },
    mailboxUser:          { type: String },
    mailboxPassword:      EncryptedFieldSchema,
    mailboxLookbackDays:  { type: Number },
    appUrl:               { type: String },
    googleClientId:       EncryptedFieldSchema,
    googleClientSecret:   EncryptedFieldSchema,
    googleRedirectUri:    { type: String },
  },
  { timestamps: true }
);

const IntegrationSettings: Model<IIntegrationSettings> =
  mongoose.models.IntegrationSettings ||
  mongoose.model<IIntegrationSettings>('IntegrationSettings', IntegrationSettingsSchema);

export default IntegrationSettings;
