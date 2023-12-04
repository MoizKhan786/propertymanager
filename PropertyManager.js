const { v4: uuidv4 } = require("uuid");
class PropertyManager {
  constructor(config = {}) {
    this.dynamoDB = config.client;
    this.tableName = config.tableName;
    this.s3 = config.s3;
    this.sns = config.sns;
    this.bucketName = config.bucketName;
    this.keyPrefix = config.keyPrefix;
    this.snsTopicArn = config.snsTopicArn;
  }

  async createProperty(propertyData, imageFile, email) {
    console.log(
      "propertyData: , imageFile: , email: ",
      propertyData,
      imageFile,
      email
    );

    const propertyId = `${Date.now()}`;

    // Upload the image to S3 and get the S3 URL
    const imageKey = await this.uploadImage(propertyId, imageFile);

    console.log("After upload image");

    // Actual DynamoDB insert operation
    const params = {
      TableName: this.tableName,
      Item: {
        propertyId: propertyId,
        title: propertyData.title,
        description: propertyData.description,
        price: propertyData.price,
        imageKey: imageKey,
        owner: email, // TODO: extract username from email and then change it to username
        location: propertyData.location,
        createdAt: new Date().toISOString(),
        type: propertyData.type,
        isBooked: false, // Assuming a new property is not booked initially
        bookedFrom: null, // Initialize to null, update when booked
        bookedTo: null, // Initialize to null, update when booked
      },
    };

    await this.dynamoDB.put(params).promise();

    await this.sendNotification(propertyId, "New property listed!");

    return propertyId;
  }

  async updateProperty(propertyId, updatedData, email) {
    // Check if the user is the owner of the property
    const property = await this.getPropertyById(propertyId);
    if (!property) {
      throw new Error("Property not found.");
    }

    if (property.owner !== email) {
      throw new Error("User does not have permission to update this property.");
    }

    const updateExpressionParts = [];
    const expressionAttributeValues = {};

    if (updatedData.title) {
      updateExpressionParts.push("#title = :title");
      expressionAttributeValues[":title"] = updatedData.title;
    }

    if (updatedData.description) {
      updateExpressionParts.push("#description = :description");
      expressionAttributeValues[":description"] = updatedData.description;
    }

    if (updatedData.price !== undefined) {
      updateExpressionParts.push("#price = :price");
      expressionAttributeValues[":price"] = updatedData.price;
    }

    if (updatedData.location) {
      updateExpressionParts.push("#location = :location");
      expressionAttributeValues[":location"] = updatedData.location;
    }

    if (updatedData.type) {
      updateExpressionParts.push("#type = :type");
      expressionAttributeValues[":type"] = updatedData.type;
    }

    if (updatedData.image) {
      updateExpressionParts.push("#image = :image");
      expressionAttributeValues[":image"] = updatedData.image;
    }

    const updateExpression = `SET ${updateExpressionParts.join(", ")}`;

    const params = {
      TableName: this.tableName,
      Key: {
        propertyId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        "#title": "title",
        "#description": "description",
        "#price": "price",
        "#location": "location",
        "#type": "type",
        "#image": "image",
      },
      ExpressionAttributeValues: expressionAttributeValues,
    };

    await this.dynamoDB.update(params).promise();

    await this.sendNotification(propertyId, "Property updated!");
  }

  async deleteProperty(propertyId, email) {
    // Check if the user is the owner of the property
    const property = await this.getPropertyById(propertyId);

    if (!property) {
      throw new Error("Property not found.");
    }

    if (property.owner !== email) {
      throw new Error("User does not have permission to update this property.");
    }

    // Replace this logic with your actual DynamoDB delete operation
    const params = {
      TableName: this.tableName,
      Key: {
        propertyId,
      },
    };

    await this.dynamoDB.delete(params).promise();
    await this.sendNotification(propertyId, `Property ${propertyId} deleted!`);
  }

  async getPropertyById(propertyId) {
    // Replace this logic with your actual DynamoDB get operation
    const params = {
      TableName: this.tableName,
      Key: {
        propertyId,
      },
    };

    const result = await this.dynamoDB.get(params).promise();
    return result.Item;
  }

  async getAllProperties() {
    const params = {
      TableName: this.tableName,
    };

    const result = await this.dynamoDB.scan(params).promise();
    return result.Items;
  }

  async sendNotification(propertyId, message) {
    const params = {
      Message: message,
      TopicArn: this.snsTopicArn,
      MessageGroupId: propertyId,
      MessageDeduplicationId: uuidv4(),
      MessageAttributes: {
        propertyId: {
          DataType: "String",
          StringValue: propertyId.toString(),
        },
      },
    };

    try {
      const data = await this.sns.publish(params).promise();
      console.log("Message sent:", data.MessageId);
    } catch (error) {
      console.error("Error sending message:", error);
      throw new Error("Failed to send notification");
    }
  }

  async bookProperty(propertyId, fromDate, toDate, email) {

    // Check if the user is the owner of the property
    const property = await this.getPropertyById(propertyId);
    if (!property) {
      throw new Error("Property not found.");
    }

    if (property.owner === email) {
      throw new Error("Owners cannot book their own properties.");
    }

    // Check if the property is of type "rent"
    if (property.type !== "rent") {
      throw new Error("This property is not available for booking.");
    }

    // Check if the property is already booked for the specified dates
    if (property.isBooked) {
      const existingBookingConflict = this.checkBookingConflict(
        property,
        fromDate,
        toDate
      );
      if (existingBookingConflict) {
        throw new Error(
          "This property is already booked for the specified dates."
        );
      }
    }

    const params = {
      TableName: this.tableName,
      Key: {
        propertyId,
      },
      UpdateExpression:
        "SET #isBooked = :isBooked, #bookedFrom = :bookedFrom, #bookedTo = :bookedTo",
      ExpressionAttributeNames: {
        "#isBooked": "isBooked",
        "#bookedFrom": "bookedFrom",
        "#bookedTo": "bookedTo",
      },
      ExpressionAttributeValues: {
        ":isBooked": true,
        ":bookedFrom": fromDate,
        ":bookedTo": toDate,
      },
    };

    await this.dynamoDB.update(params).promise();
    await this.sendNotification(propertyId, "Property Booked!");
  }

  async uploadImage(propertyId, imageFile) {
    const bucketName = this.bucketName;
    const key = `${this.keyPrefix}/${propertyId}/${imageFile.name}`;

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: Buffer.from(imageFile.data, 'base64'),
      ContentType: imageFile.mimetype,
    };

    const uploadResponse = await this.s3.upload(params).promise();
    return uploadResponse.Location;
  }

  checkBookingConflict(property, fromDate, toDate) {
    // Check if the property is already booked for any dates
    if (property.isBooked) {
      // Parse existing booked dates from strings to Date objects
      const bookedFromDate = new Date(property.bookedFrom);
      const bookedToDate = new Date(property.bookedTo);

      // Parse requested booking dates from strings to Date objects
      const requestedFromDate = new Date(fromDate);
      const requestedToDate = new Date(toDate);

      // Check for date conflicts
      if (
        (requestedFromDate >= bookedFromDate &&
          requestedFromDate <= bookedToDate) ||
        (requestedToDate >= bookedFromDate &&
          requestedToDate <= bookedToDate) ||
        (requestedFromDate <= bookedFromDate && requestedToDate >= bookedToDate)
      ) {
        // There is a date conflict
        return true;
      }
    }

    // No date conflict

    return false;
  }
}

module.exports = PropertyManager;
