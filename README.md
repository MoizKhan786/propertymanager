# propertymanager

## Use

To use the property manager - `npm i property-manager-for-aws`
https://www.npmjs.com/package/property-manager-for-aws

## Property Manager manages all the property related operations like
- List Properties
- Get a property
- Delete a property
- Update a property
- Book a property

## To create a property manager client

### Provide config
    this.dynamoDB = config.client; // Your DB client
    this.tableName = config.tableName; // Property table name
    this.s3 = config.s3; // s3 config
    this.sns = config.sns; // SNS for sending notifications
    this.bucketName = config.bucketName; // s3 bucket name
    this.keyPrefix = config.keyPrefix; 
    this.snsTopicArn = config.snsTopicArn; // SNS topic subscribing

### Example

```
const PropertyManager = require("property-manager-for-aws");

const getPropertyManagerClient = (credentials) => {
  const s3 = new AWS.S3({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken
},
    region: "us-east-1",
  });
  const sns = new AWS.SNS({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken
    },
    region: "us-east-1",
  });
  const propertyManagerClient = new PropertyManager({
    client: getDBClient(credentials),
    tableName: property_table,
    bucketName: property_image_bucket,
    keyPrefix: "images",
    s3,
    sns,
    snsTopicArn: sns_topic,
  });

  return propertyManagerClient;
}

module.exports = {
  getPropertyManagerClient
}
```
