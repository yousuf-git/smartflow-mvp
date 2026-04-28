# Entities

01. User
02. Role
03. Permission
04. Role_Permissions
05. Customer
06. Customer_Type
07. Staff
08. Designation
09. Plant
10. Price
11. Limit
12. Controller
13. Tap
14. Purchase
15. Refund
16. Wallet_Transaction
17. Plant_staff
18. Operating Hours
19. LookupCategory
20. Lookup


## DATABASE

| Entity | Fields |
|--------|--------|
| Price | PRICE_ID, CURRENCY, UNIT_PRICE, TIMESTAMP |
| Limit | LIMIT_ID, DAILY_LITRE_LIMIT, TIMESTAMP |
| Customer_Type | CUSTOMER_TYPE_ID, PRICE_ID (FK), LIMIT_ID (FK), CUSTOMER_TYPE_NAME |
| User | USER_ID, ROLE_ID (FK), FIRST_NAME, LAST_NAME, PASSWORD_HASH, CREATED_AT, CREATED_BY (FK from USER), IS_LOCKED, LOCKED_AT, LOCKED_BY (FK from USER), UNLOCKED_AT, UNLOCKED_BY (FK by USER), MODIFIED_AT, MODIFIED_BY (FK from USER), PHONE, EMAIL |
| Role | ROLE_ID, NAME, DESCRIPTION, CREATED_AT, IS_ACTIVE |
| Permission | PERMISSION_ID, NAME, DESCRIPTION, CREATED_AT, IS_ACTIVE |
| Role_Permissions | ROLE_ID (FK), PERMISSION_ID (FK) |
| Customer | CUSTOMER_ID, CUSTOMER_TYPE_ID (FK), USER_ID (FK) |
| Staff | STAFF_ID, USER_ID (FK), DESIGNATION |
| Plant | PLANT_ID, PLANT_NAME, COUNTRY, CITY, PROVINCE, AREA, ADDRESS, CREATED_AT, APPROVAL_DATE, IS_ACTIVE, STATUS |
| Plant_Staff | PLANT_ID (FK), STAFF_ID (FK) |
| Purchase | PURCHASE_ID, PRICE_ID (FK), LIMIT_ID (FK), PLANT_ID (FK), USER_ID (FK), TAP_ID (FK), DATE_TIME, LITRES_COUNT, STATUS |
| Refund | REFUND_ID, PURCHASE_ID (FK), VALID_TILL, LITRES_COUNT, STATUS[Available/Expired/Claimed], REFUND_TYPE[Credit/Debit], TIMESTAMP |
| Wallet_Transaction | WALLET_TRANSACTION_ID, USER_ID (FK), DATE_TIME, AMOUNT, TRANSACTION_TYPE |
| Tap | TAP_ID, CONTROLLER_ID (FK), PLANT_ID (FK), GPIO_PIN_NUMBER, STATUS, IS_AVAILBALE |
| Controller | CONTROLLER_ID, Name, PLANT_ID (FK), STATUS, IS_ACTIVE |
| Designation | DESIGNATION_ID, NAME, DESCRIPTION |

---
---

### Notes
---

### Email
Email is our auth attribute

### Refund Notes
- Credit: when refund is issued
- Debit: when refund is used
- VALID_TILL will be NULL for Debit Type

### Wallet_Transaction Notes
- Credit: when depositing money
- Debit: when purchasing water
- Net Balance: will be calculated each time by sum(credit) - sum (debit)

---

## Entity Schemas

### User
- USER_ID: `integer` [system_generated_sequential_id]
- FIRST_NAME: `string` [Mandatory_attribute]
- LAST_NAME: `string` [Mandatory_attribute]
- CNIC: `string` [Unique, optional]
- COUNTRY: `string` [optional]
- CITY: `string` [optional]
- PROVINCE: `string` [optional]
- AREA: `string` [optional]
- ADDRESS: `string` [optional]
- ROLE_ID (FK): inherited_from_role
- PASSWORD_HASH: `string`
- CREATED_AT: `timestamptz` [system_generated]
- CREATED_BY: (FK from USER) [will be null if signup himself]
- IS_LOCKED: `boolean` [false_by_default]
- LOCKED_AT: `timestamptz` [null_by_default]
- LOCKED_BY (FK from USER)
- UNLOCKED_AT: `timestamptz` [null_by_default]
- UNLOCKED_BY (FK by USER)
- MODIFIED_AT: `timestamptz` [null_by_default, updated_by_system]
- MODIFIED_BY (FK from USER)
- PHONE: `string` [optional]
- EMAIL: `string` [Mandatory_attribute, used for auth]
- IS_EMAIL_VERIFIED: `boolean` [false_by_default]

### Role
- ROLE_ID: `integer` [system_generated_sequential_id]
- NAME: `string` [Mandatory_attribute]
- DESCRIPTION: `string` [null_by_default]
- CREATED_AT: `timestamptz` [system_generated]
- IS_ACTIVE: `boolean` [false_by_default]

### Permission
- PERMISSION_ID: `integer` [system_generated_sequential_id]
- NAME: `string` [Mandatory_attribute]
- DESCRIPTION: `string` [null_by_default]
- CREATED_AT: `timestamptz` [system_generated]
- IS_ACTIVE: `boolean` [false_by_default]

### Role_Permissions
- ROLE_ID (FK)
- PERMISSION_ID (FK)

### Customer
- CUSTOMER_ID: `integer` [system_generated_sequential_id]
- CUSTOMER_TYPE_ID (FK)
- USER_ID (FK)

### Staff
- STAFF_ID: `integer` [system_generated_sequential_id]
- USER_ID (FK)
- DESIGNATION_ID (FK)

### Plant
- PLANT_ID: `integer` [system_generated_sequential_id]
- NAME: `string` [Mandatory_attribute]
- COUNTRY: `string` [Mandatory_attribute]
- CITY: `string` [Mandatory_attribute]
- PROVINCE: `string` [Mandatory_attribute]
- AREA: `string` [Mandatory_attribute]
- ADDRESS: `string` [Mandatory_attribute]
- CREATED_AT: `timestamptz` [now_by_default]
- APPROVED_AT: `timestamptz` [null_by_default]
- IS_ACTIVE: `boolean` [false_by_default]
- STATUS: `enum` [operational, under_review, maintenance] [under_review_by_default]

### Plant_Staff
- PLANT_ID (FK)
- STAFF_ID (FK)

### Purchase
- PURCHASE_ID: `integer` [system_generated_sequential_id]
- LIMIT_ID (FK)
- PRICE_ID (FK)
- PLANT_ID (FK)
- USER_ID (FK)
- TAP_ID (FK)
- DATE_TIME: `timestamptz` [now_by_default]
- LITRES_COUNT: `float` [Mandatory_attribute]
- STATUS: `enum` [PARTIAL_COMPLETED, COMPLETED]

### Refund
- REFUND_ID: `integer` [system_generated_sequential_id]
- PURCHASE_ID (FK)
- VALID_TILL: `timestamptz` [system_generated, null for Debit]
- LITRES_COUNT: `float` [Mandatory_attribute]
- STATUS: `string` [Available/Expired, Claimed] [available_by_default, claimed for debit]
- REFUND_TYPE: `string` [Credit/Debit] [credit_by_default]
- TIMESTAMP: `timestamptz` [now_by_default]

### Wallet_Transaction
- TRANSACTION_ID: `integer` [system_generated_sequential_id]
- USER_ID (FK)
- TIMESTAMP: `timestamptz` [now_by_default]
- AMOUNT: `float` [Mandatory_attribute]
- TRANSACTION_TYPE: `enum` [Mandatory_attribute] [debit_by_default]

### Tap
- TAP_ID: `integer` [system_generated_sequential_id]
- Controller_ID (FK)
- PLANT_ID (FK)
- GPIO_PIN_NUMBER: `integer` [Mandatory_attribute]
- STATUS: `enum` [operational/maintenance] [Mandatory_attribute]
- IS_AVAILBALE: `boolean` [false_by_default]

### Controller
- CONTROLLER_ID: `integer` [system_generated_sequential_id]
- Name: `string` [Mandatory_attribute, e.g., ESP32]
- PLANT_ID (FK)
- MAC_ADDRESS: `integer` [unique_address, optional_attribute]
- COM_ID: `integer` [optional_attribute]
- STATUS: `enum` [operational/maintenance] [Mandatory_attribute]
- IS_ACTIVE: `boolean` [false_by_default]

### Designation
- DESIGNATION_ID: `integer` [system_generated_sequential_id]
- NAME: `string` [Mandatory_attribute]
- DESCRIPTION: `string` [null_by_default, optional]

### Price
- PRICE_ID: `integer` [system_generated_sequential_id]
- CURRENCY: `string` [mandatory, PKR_by_default]
- UNIT_PRICE: `float` [mandatory, zero_by_default]
- TIMESTAMP: `timestamptz` [now_by_default, system_generated]
- IS_ACTIVE: `boolean` [false_by_default]

### Limit
- LIMIT_ID: `integer` [system_generated_sequential_id]
- DAILY_LITRE_LIMIT: `float` [zero_by_default, Mandatory_attribute]
- TIMESTAMP: `timestamptz` [now_by_default, system_generated]
- IS_ACTIVE: `boolean` [false_by_default]

### Customer_Type
- CUSTOMER_TYPE_ID: `integer` [system_generated_sequential_id]
- LIMIT_ID (FK) [current applicable price]
- PRICE_ID (FK) [current applicable limit]
- CUSTOMER_TYPE_NAME: `string` [Mandatory_attribute]

### Operating Hours

- Id
- Plant_id
- Day_of_week
- Opening_time
- Closing_time
- is_closed


### LookupCategory

Id
Name
description

### Lookup
Id
Cat_id
Code
Display_name
Sort_order
is_active
