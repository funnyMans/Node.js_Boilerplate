import unittest
from unittest.mock import patch

from etl_project.s3_client import create_s3_client


class S3ClientTest(unittest.TestCase):
    @patch("etl_project.s3_client.boto3.client")
    def test_configures_bounded_retries_timeouts_and_path_addressing(self, client_factory):
        create_s3_client(
            endpoint_url="http://s3-mock:9000",
            region_name="us-east-1",
            access_key_id="local-key",
            secret_access_key="local-secret",
        )

        client_factory.assert_called_once()
        kwargs = client_factory.call_args.kwargs
        config = kwargs["config"]
        self.assertEqual(kwargs["endpoint_url"], "http://s3-mock:9000")
        self.assertEqual(kwargs["region_name"], "us-east-1")
        self.assertEqual(config.connect_timeout, 3)
        self.assertEqual(config.read_timeout, 10)
        self.assertEqual(config.retries, {"mode": "standard", "total_max_attempts": 3})
        self.assertEqual(config.s3, {"addressing_style": "path"})


if __name__ == "__main__":
    unittest.main()
