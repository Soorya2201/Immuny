import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { askMedGemma } from './functions/ask-medgemma/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
  data,
  askMedGemma,
});

// Give the function permission to invoke SageMaker endpoints
backend.askMedGemma.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['sagemaker:InvokeEndpoint'],
    resources: ['*'], // Allows access to your SageMaker endpoints
  })
);

export default backend;