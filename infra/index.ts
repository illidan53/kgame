// k8s-game.nphunter.gg：私有 S3 桶 + CloudFront（OAC）+ ACM 证书 + Route 53 别名记录。
// 和 global-network.nphunter.gg 同一套做法，只往 nphunter.gg 托管区里加本子域名的记录。
// 本地执行：cd infra && npm ci && AWS_PROFILE=nphunter-sso pulumi up -s prod

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const domain = config.require("domain");
const zoneName = config.require("zoneName");
const bucketName = config.require("bucketName");

const tags = { Service: "kgame", Name: "kgame-k8s-game" };

// AWS 托管策略 ID
const CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const SECURITY_HEADERS = "67f7725c-6f97-4210-82d7-5512b31e9d03";

const zone = aws.route53.getZoneOutput({ name: zoneName, privateZone: false });

// ---------------------------------------------------------------- S3

const bucket = new aws.s3.Bucket("siteBucket", { bucket: bucketName, tags });

new aws.s3.BucketPublicAccessBlock("siteBucketPublicAccessBlock", {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketOwnershipControls("siteBucketOwnership", {
  bucket: bucket.id,
  rule: { objectOwnership: "BucketOwnerEnforced" },
});

new aws.s3.BucketServerSideEncryptionConfiguration("siteBucketEncryption", {
  bucket: bucket.id,
  rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
});

// ---------------------------------------------------------------- 证书（CloudFront 要求 us-east-1）

const cert = new aws.acm.Certificate("siteCert", {
  domainName: domain,
  validationMethod: "DNS",
  tags,
});

const certValidationRecord = new aws.route53.Record("siteCertValidation", {
  zoneId: zone.zoneId,
  name: cert.domainValidationOptions[0].resourceRecordName,
  type: cert.domainValidationOptions[0].resourceRecordType,
  records: [cert.domainValidationOptions[0].resourceRecordValue],
  ttl: 300,
  allowOverwrite: true,
});

const certValidation = new aws.acm.CertificateValidation("siteCertValidationWait", {
  certificateArn: cert.arn,
  validationRecordFqdns: [certValidationRecord.fqdn],
});

// ---------------------------------------------------------------- CloudFront

const oac = new aws.cloudfront.OriginAccessControl("siteOac", {
  name: "kgame-k8s-game-oac",
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

const originId = "s3-kgame-k8s-game";

const distribution = new aws.cloudfront.Distribution("siteCdn", {
  enabled: true,
  isIpv6Enabled: true,
  httpVersion: "http2and3",
  comment: domain,
  defaultRootObject: "index.html",
  aliases: [domain],
  origins: [{ domainName: bucket.bucketRegionalDomainName, originId, originAccessControlId: oac.id }],
  defaultCacheBehavior: {
    targetOriginId: originId,
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    compress: true,
    cachePolicyId: CACHING_OPTIMIZED,
    responseHeadersPolicyId: SECURITY_HEADERS,
  },
  viewerCertificate: {
    acmCertificateArn: certValidation.certificateArn,
    sslSupportMethod: "sni-only",
    minimumProtocolVersion: "TLSv1.2_2021",
  },
  restrictions: { geoRestriction: { restrictionType: "none" } },
  priceClass: "PriceClass_All",
  tags,
});

new aws.s3.BucketPolicy("siteBucketPolicy", {
  bucket: bucket.id,
  policy: pulumi.all([bucket.arn, distribution.arn]).apply(([bucketArn, distributionArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontOAC",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:GetObject",
          Resource: `${bucketArn}/*`,
          Condition: { StringEquals: { "AWS:SourceArn": distributionArn } },
        },
      ],
    }),
  ),
});

for (const type of ["A", "AAAA"] as const) {
  new aws.route53.Record(`siteAlias${type}`, {
    zoneId: zone.zoneId,
    name: domain,
    type,
    aliases: [{ name: distribution.domainName, zoneId: distribution.hostedZoneId, evaluateTargetHealth: false }],
  });
}

export const url = `https://${domain}`;
export const bucketId = bucket.id;
export const distributionId = distribution.id;
export const distributionDomain = distribution.domainName;
