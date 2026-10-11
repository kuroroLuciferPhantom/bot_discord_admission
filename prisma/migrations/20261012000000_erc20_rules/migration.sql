CREATE TYPE "RuleAssetType" AS ENUM ('NFT', 'ERC20');
ALTER TABLE "RoleRule"
  ADD COLUMN "assetType" "RuleAssetType" NOT NULL DEFAULT 'NFT',
  ADD COLUMN "decimals" INTEGER;
ALTER TABLE "RoleRule" ADD CONSTRAINT "RoleRule_asset_shape_check" CHECK (
  ("assetType" = 'NFT' AND "decimals" IS NULL) OR
  ("assetType" = 'ERC20' AND "decimals" IS NOT NULL AND "decimals" BETWEEN 0 AND 255 AND cardinality("tokenIds") = 0)
);
