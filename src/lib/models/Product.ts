import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  category: string;
  description?: string;
  pricing?: string;
  moq?: string;
  certifications?: string[];
  shippingDetails?: string;
  approvedClaims?: string[];
  restrictedClaims?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String },
    pricing: { type: String },
    moq: { type: String },
    certifications: [{ type: String }],
    shippingDetails: { type: String },
    approvedClaims: [{ type: String }],
    restrictedClaims: [{ type: String }],
  },
  { timestamps: true }
);

const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
export default Product;
